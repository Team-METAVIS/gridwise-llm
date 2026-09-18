// Math Optimizer stage (Problem Statement §09). Builds and solves a linear
// program for the 24-hour schedule: five continuous, non-negative variables
// per hour (grid, solar_used, charge, discharge, soc-after), minimizing
// total grid cost subject to energy balance, effective solar, battery
// bounds/rate limits, active directive constraints, and end-of-day
// neutrality. See docs/EXECUTION_PLAN.md section 5 for the full derivation,
// including why a post-solve charge/discharge normalization step (below) is
// required even though the LP itself is correct.

import solver from "javascript-lp-solver";
import type { LPModel } from "javascript-lp-solver";

import { EPS, HOURS } from "@/lib/constants";
import type { Battery, DirectiveInterpretation, HourEntry, HourlyPlanEntry } from "@/types/gridwise";

export { EPS, HOURS };

export interface HourConstraints {
  effectiveSolar: number[];
  minReserve: number[];
  maxCharge: number[];
  maxDischarge: number[];
  maxGrid: (number | null)[];
}

/** Shared by the optimizer and the final replay validator so both derive the
 * exact same per-hour effective limits from the trusted directives. */
export function buildHourConstraints(hours: HourEntry[], battery: Battery, directives: DirectiveInterpretation[]): HourConstraints {
  const byHour = new Map(hours.map((h) => [h.hour, h]));
  const effectiveSolar = Array.from({ length: HOURS }, (_, h) => byHour.get(h)!.solar_kwh);
  const minReserve = Array.from({ length: HOURS }, () => battery.minimum_energy_kwh);
  const maxCharge = Array.from({ length: HOURS }, () => battery.max_charge_kwh_per_hour);
  const maxDischarge = Array.from({ length: HOURS }, () => battery.max_discharge_kwh_per_hour);
  const maxGrid: (number | null)[] = Array.from({ length: HOURS }, () => null);

  for (const d of directives) {
    if (!d.applies || !d.structured_adjustment) continue;
    const adj = d.structured_adjustment as any;
    const applicableHours: number[] = adj.hours ?? [];

    switch (d.directive_type) {
      case "solar_reduction":
        for (const h of applicableHours) effectiveSolar[h] = effectiveSolar[h]! * adj.factor;
        break;
      case "minimum_battery_reserve":
        for (const h of applicableHours) minReserve[h] = Math.max(minReserve[h]!, adj.minimum_energy_kwh);
        break;
      case "no_charge_window":
        for (const h of applicableHours) maxCharge[h] = 0;
        break;
      case "no_discharge_window":
        for (const h of applicableHours) maxDischarge[h] = 0;
        break;
      case "max_grid_window":
        for (const h of applicableHours) {
          maxGrid[h] = maxGrid[h] === null ? adj.max_grid_kwh : Math.min(maxGrid[h]!, adj.max_grid_kwh);
        }
        break;
    }
  }

  return { effectiveSolar, minReserve, maxCharge, maxDischarge, maxGrid };
}

export interface OptimizerResult {
  hourlyPlan: HourlyPlanEntry[];
  totalGridKwh: number;
  totalCostBdt: number;
  peakGridKwh: number;
}

export function solveSchedule(
  hours: HourEntry[],
  battery: Battery,
  directives: DirectiveInterpretation[]
): OptimizerResult {
  const byHour = new Map(hours.map((h) => [h.hour, h]));
  const { effectiveSolar, minReserve, maxCharge, maxDischarge, maxGrid } = buildHourConstraints(hours, battery, directives);

  const model: LPModel = {
    optimize: "cost",
    opType: "min",
    constraints: {},
    variables: {},
  };

  for (let h = 0; h < HOURS; h++) {
    const hourEntry = byHour.get(h)!;
    const grid = `grid_${h}`;
    const solarUsed = `solar_${h}`;
    const charge = `charge_${h}`;
    const discharge = `discharge_${h}`;
    const soc = `soc_${h}`;

    model.variables[grid] = { cost: hourEntry.tariff_bdt_per_kwh, [`balance_${h}`]: 1 };
    model.variables[solarUsed] = { cost: 0, [`balance_${h}`]: 1, [`solarcap_${h}`]: 1 };
    model.variables[discharge] = { cost: 0, [`balance_${h}`]: 1, [`chargebal_${h}`]: 1, [`dischargecap_${h}`]: 1 };
    model.variables[charge] = { cost: 0, [`balance_${h}`]: -1, [`chargebal_${h}`]: -1, [`chargecap_${h}`]: 1 };
    model.variables[soc] = { cost: 0, [`chargebal_${h}`]: 1, [`soc_${h}`]: 1 };
    if (h > 0) {
      model.variables[`soc_${h - 1}`]![`chargebal_${h}`] = -1;
    }

    // Energy balance: grid + solar_used + discharge - charge = demand
    model.constraints[`balance_${h}`] = { equal: hourEntry.demand_kwh };
    // Solar usage cannot exceed effective solar for the hour.
    model.constraints[`solarcap_${h}`] = { max: effectiveSolar[h] };
    // Battery transition: soc_h - soc_{h-1} - charge_h + discharge_h = 0
    // (soc_{-1} is the constant initial_energy_kwh, folded into the RHS here).
    model.constraints[`chargebal_${h}`] = { equal: h === 0 ? battery.initial_energy_kwh : 0 };
    // Battery state bounds (active reserve floor .. capacity ceiling).
    model.constraints[`soc_${h}`] = { min: minReserve[h], max: battery.capacity_kwh };
    // Hourly charge/discharge rate limits (0 under an active no_charge/no_discharge window).
    model.constraints[`chargecap_${h}`] = { max: maxCharge[h] };
    model.constraints[`dischargecap_${h}`] = { max: maxDischarge[h] };
    // Grid import cap under an active max_grid_window directive.
    if (maxGrid[h] !== null) {
      model.constraints[`gridcap_${h}`] = { max: maxGrid[h]! };
      model.variables[grid][`gridcap_${h}`] = 1;
    }
  }

  // End-of-day battery neutrality: soc_23 = initial_energy_kwh.
  model.constraints["eod_neutrality"] = { equal: battery.initial_energy_kwh };
  model.variables[`soc_${HOURS - 1}`]!["eod_neutrality"] = 1;

  const result = solver.Solve(model);
  if (!result.feasible) {
    throw new Error(
      "Optimizer could not find a feasible schedule for this scenario + directive combination."
    );
  }

  const hourlyPlan: HourlyPlanEntry[] = [];
  let currentSoc = battery.initial_energy_kwh;

  for (let h = 0; h < HOURS; h++) {
    const hourEntry = byHour.get(h)!;
    let grid = Math.max(0, Number(result[`grid_${h}`] ?? 0));
    if (maxGrid[h] !== null) {
      grid = Math.min(maxGrid[h]!, grid);
    }
    const solarUsed = Math.min(effectiveSolar[h]!, Math.max(0, Number(result[`solar_${h}`] ?? 0)));
    const chargeVar = Math.max(0, Number(result[`charge_${h}`] ?? 0));
    const dischargeVar = Math.max(0, Number(result[`discharge_${h}`] ?? 0));

    // Net out simultaneous charge+discharge (see module docstring): the LP
    // treats churn as a free degree of freedom that leaves soc/grid/solar
    // unaffected, so the single reportable action is just the net.
    const net = chargeVar - dischargeVar;
    let battery_action: HourlyPlanEntry["battery_action"] = "idle";
    let battery_kwh = 0;
    if (net > EPS) {
      battery_action = "charge";
      battery_kwh = Math.min(maxCharge[h]!, net);
    } else if (net < -EPS) {
      battery_action = "discharge";
      battery_kwh = Math.min(maxDischarge[h]!, -net);
    }

    const roundedCharge = battery_action === "charge" ? battery_kwh : 0;
    const roundedDischarge = battery_action === "discharge" ? battery_kwh : 0;
    currentSoc = currentSoc + roundedCharge - roundedDischarge;

    // Enforce energy balance by setting grid to meet remaining demand
    const calculatedGrid = Math.max(0, hourEntry.demand_kwh + roundedCharge - solarUsed - roundedDischarge);
    const finalGrid = maxGrid[h] !== null ? Math.min(maxGrid[h]!, calculatedGrid) : calculatedGrid;

    hourlyPlan.push({
      hour: h,
      grid_kwh: cleanNum(finalGrid),
      solar_used_kwh: cleanNum(solarUsed),
      battery_action,
      battery_kwh: cleanNum(battery_kwh),
      battery_energy_after_kwh: cleanNum(currentSoc),
    });
  }

  const totalGridKwh = round2(hourlyPlan.reduce((sum, h) => sum + h.grid_kwh, 0));
  const totalCostBdt = round2(
    hourlyPlan.reduce((sum, h) => sum + h.grid_kwh * byHour.get(h.hour)!.tariff_bdt_per_kwh, 0)
  );
  const peakGridKwh = round2(Math.max(...hourlyPlan.map((h) => h.grid_kwh)));

  return { hourlyPlan, totalGridKwh, totalCostBdt, peakGridKwh };
}

function cleanNum(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
