// Final Validator stage (Problem Statement §11.3 / Participant Guide §08).
// Independently replays the optimizer's own hourly_plan, hour by hour,
// exactly the way the judge harness will: energy balance, effective solar,
// battery bounds/rate limits/transitions, active directive constraints, and
// end-of-day neutrality. If this ever fails it means the optimizer produced
// an invalid plan -- a bug to fix, not something to paper over -- so this
// throws rather than returning a best-effort response.
//
// It also recomputes total_grid_kwh, total_cost_bdt, and peak_grid_kwh
// directly from hourly_plan, since hourly_plan is the judge's source of
// truth for those totals, not whatever the optimizer tracked internally.

import { HOURS, TOLERANCE } from "@/lib/constants";
import { buildHourConstraints } from "@/lib/optimizer";
import type { Battery, DirectiveInterpretation, HourEntry, HourlyPlanEntry } from "@/types/gridwise";

export interface ReplayTotals {
  totalGridKwh: number;
  totalCostBdt: number;
  peakGridKwh: number;
}

export { TOLERANCE };

class ReplayValidationError extends Error {}

export function replayAndValidate(
  hours: HourEntry[],
  battery: Battery,
  directives: DirectiveInterpretation[],
  hourlyPlan: HourlyPlanEntry[]
): ReplayTotals {
  const byHour = new Map(hours.map((h) => [h.hour, h]));
  const { effectiveSolar, minReserve, maxCharge, maxDischarge, maxGrid } = buildHourConstraints(hours, battery, directives);

  if (hourlyPlan.length !== HOURS) {
    throw new ReplayValidationError(`hourly_plan must contain exactly ${HOURS} entries, got ${hourlyPlan.length}.`);
  }
  const seenHours = new Set<number>();

  let soc = battery.initial_energy_kwh;

  for (let h = 0; h < HOURS; h++) {
    const entry = hourlyPlan.find((p) => p.hour === h);
    if (!entry) throw new ReplayValidationError(`hourly_plan is missing hour ${h}.`);
    if (seenHours.has(h)) throw new ReplayValidationError(`hourly_plan has a duplicate entry for hour ${h}.`);
    seenHours.add(h);

    const hourEntry = byHour.get(h)!;

    for (const [field, value] of Object.entries({
      grid_kwh: entry.grid_kwh,
      solar_used_kwh: entry.solar_used_kwh,
      battery_kwh: entry.battery_kwh,
      battery_energy_after_kwh: entry.battery_energy_after_kwh,
    })) {
      if (!Number.isFinite(value)) throw new ReplayValidationError(`hour ${h}: ${field} is not finite.`);
    }
    if (entry.grid_kwh < -TOLERANCE) throw new ReplayValidationError(`hour ${h}: grid_kwh is negative.`);
    if (entry.solar_used_kwh < -TOLERANCE) throw new ReplayValidationError(`hour ${h}: solar_used_kwh is negative.`);
    if (entry.battery_kwh < -TOLERANCE) throw new ReplayValidationError(`hour ${h}: battery_kwh is negative.`);

    if (entry.battery_action === "idle" && Math.abs(entry.battery_kwh) > TOLERANCE) {
      throw new ReplayValidationError(`hour ${h}: battery_action is idle but battery_kwh is nonzero.`);
    }

    const chargeAmount = entry.battery_action === "charge" ? entry.battery_kwh : 0;
    const dischargeAmount = entry.battery_action === "discharge" ? entry.battery_kwh : 0;

    if (chargeAmount > maxCharge[h]! + TOLERANCE) {
      throw new ReplayValidationError(`hour ${h}: charge ${chargeAmount} exceeds the active limit ${maxCharge[h]}.`);
    }
    if (dischargeAmount > maxDischarge[h]! + TOLERANCE) {
      throw new ReplayValidationError(`hour ${h}: discharge ${dischargeAmount} exceeds the active limit ${maxDischarge[h]}.`);
    }

    if (entry.solar_used_kwh > effectiveSolar[h]! + TOLERANCE) {
      throw new ReplayValidationError(
        `hour ${h}: solar_used_kwh ${entry.solar_used_kwh} exceeds effective solar ${effectiveSolar[h]}.`
      );
    }

    if (maxGrid[h] !== null && entry.grid_kwh > maxGrid[h]! + TOLERANCE) {
      throw new ReplayValidationError(`hour ${h}: grid_kwh ${entry.grid_kwh} exceeds max_grid_window cap ${maxGrid[h]}.`);
    }

    // Energy balance: grid + solar_used + discharge = demand + charge
    const balance = entry.grid_kwh + entry.solar_used_kwh + dischargeAmount - hourEntry.demand_kwh - chargeAmount;
    if (Math.abs(balance) > TOLERANCE) {
      throw new ReplayValidationError(`hour ${h}: energy balance does not hold (off by ${balance}).`);
    }

    // Battery transition: soc_h = soc_{h-1} + charge - discharge
    soc = soc + chargeAmount - dischargeAmount;
    if (Math.abs(soc - entry.battery_energy_after_kwh) > TOLERANCE) {
      throw new ReplayValidationError(
        `hour ${h}: battery_energy_after_kwh ${entry.battery_energy_after_kwh} does not match replayed state ${soc}.`
      );
    }
    if (soc < minReserve[h]! - TOLERANCE || soc > battery.capacity_kwh + TOLERANCE) {
      throw new ReplayValidationError(`hour ${h}: battery state ${soc} is outside [${minReserve[h]}, ${battery.capacity_kwh}].`);
    }
  }

  if (Math.abs(soc - battery.initial_energy_kwh) > TOLERANCE) {
    throw new ReplayValidationError(
      `End-of-day battery neutrality violated: final ${soc} kWh vs initial ${battery.initial_energy_kwh} kWh.`
    );
  }

  const totalGridKwh = round2(hourlyPlan.reduce((sum, h) => sum + h.grid_kwh, 0));
  const totalCostBdt = round2(
    hourlyPlan.reduce((sum, h) => sum + h.grid_kwh * byHour.get(h.hour)!.tariff_bdt_per_kwh, 0)
  );
  const peakGridKwh = round2(Math.max(...hourlyPlan.map((h) => h.grid_kwh)));

  return { totalGridKwh, totalCostBdt, peakGridKwh };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
