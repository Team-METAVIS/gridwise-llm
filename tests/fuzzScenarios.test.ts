import { describe, expect, it } from "vitest";

import { solveSchedule } from "@/lib/optimizer";
import { replayAndValidate } from "@/lib/replay";
import type { Battery, DirectiveInterpretation, HourEntry } from "@/types/gridwise";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function generateRandomScenario(seed: number) {
  // Deterministic pseudo-random numbers from seed
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const hours: HourEntry[] = [];
  for (let h = 0; h < 24; h++) {
    const demand = round3(50 + rand() * 150); // 50 - 200 kWh
    const solar = round3((h >= 6 && h <= 18 ? rand() * 120 : 0)); // 0 - 120 kWh
    const tariff = round3(6 + rand() * 12); // 6 - 18 BDT
    hours.push({
      hour: h,
      demand_kwh: demand,
      solar_kwh: solar,
      tariff_bdt_per_kwh: tariff,
    });
  }

  const capacity = round3(200 + rand() * 300); // 200 - 500 kWh
  const minReserve = round3(30 + rand() * 50); // 30 - 80 kWh
  const initial = round3(minReserve + rand() * (capacity - minReserve)); // within [min, cap]
  const maxCharge = round3(50 + rand() * 100);
  const maxDischarge = round3(50 + rand() * 100);

  const battery: Battery = {
    capacity_kwh: capacity,
    initial_energy_kwh: initial,
    minimum_energy_kwh: minReserve,
    max_charge_kwh_per_hour: maxCharge,
    max_discharge_kwh_per_hour: maxDischarge,
  };

  return { hours, battery };
}

describe("Fuzz testing optimizer & replay with 3-decimal floating point inputs", () => {
  for (let i = 1; i <= 10; i++) {
    it(`scenario ${i}: solves and passes canonical replay validation with mixed 3-decimal values`, () => {
      const { hours, battery } = generateRandomScenario(i * 1337);

      const directives: DirectiveInterpretation[] = [
        {
          note_index: 0,
          applies: true,
          directive_type: "solar_reduction",
          structured_adjustment: { hours: [11, 12, 13], factor: 0.5 },
          explanation: "Cloud cover test",
        },
        {
          note_index: 1,
          applies: true,
          directive_type: "minimum_battery_reserve",
          structured_adjustment: {
            hours: [18, 19, 20],
            minimum_energy_kwh: round3(battery.minimum_energy_kwh + 15),
          },
          explanation: "Evening peak reserve",
        },
        {
          note_index: 2,
          applies: true,
          directive_type: "no_charge_window",
          structured_adjustment: { hours: [17, 18, 19] },
          explanation: "No charge during peak tariff",
        },
        {
          note_index: 3,
          applies: false,
          directive_type: "no_op",
          structured_adjustment: null,
          explanation: "No operation note",
        },
      ];

      const result = solveSchedule(hours, battery, directives);
      expect(result.hourlyPlan).toHaveLength(24);

      // Replay validator must pass without throwing
      const totals = replayAndValidate(hours, battery, directives, result.hourlyPlan);
      expect(totals.totalGridKwh).toBeGreaterThanOrEqual(0);
      expect(totals.totalCostBdt).toBeGreaterThanOrEqual(0);
      expect(totals.peakGridKwh).toBeGreaterThanOrEqual(0);
    });
  }
});
