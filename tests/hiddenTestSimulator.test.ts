/**
 * Hidden-Test Simulator
 * BUP CSE Fest 2026 Hackathon (Team Metavis)
 *
 * Generates 50 randomized, judge-style stress scenarios across wide ranges
 * of campus demand (50-500 kWh), solar generation (0-300 kWh), battery capacities
 * (100-500 kWh), and multi-directive combinations (solar curtailment, no charge/discharge,
 * reserve floors, grid caps).
 *
 * Verifies mathematical feasibility, energy balance, and canonical replay validation.
 */

import { describe, expect, it } from "vitest";
import { solveSchedule } from "@/lib/optimizer";
import { replayAndValidate } from "@/lib/replay";
import { parseEmergencyDirectives } from "@/lib/llm/emergencyParser";
import { applyGuardrails } from "@/lib/guardrails";
import type { Battery, HourEntry, OptimizeEnergyRequest } from "@/types/gridwise";

function pseudoRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe("Hidden-Test Simulator (50 Judge-Style Randomized Scenarios)", () => {
  const rand = pseudoRandom(20260918);

  const sampleDirectives = [
    "Solar output will drop to about 20% from 1 PM to 3 PM.",
    "Do not charge the battery between 2 PM and 4 PM.",
    "Keep at least 50% capacity stored between 6 PM and 9 PM.",
    "Do not discharge the battery between 8 AM and 11 AM.",
    "Limit grid draw to 150 kWh from 5 PM to 8 PM.",
    "The campus shuttle schedule was updated.",
    "PV generation will be one fifth during maintenance from 11 AM to 2 PM.",
    "Do not charge between 12 PM and 3 PM due to transformer servicing.",
    "Keep battery above 100 kWh for evening contingency.",
    "Cafeteria menu changes tomorrow.",
  ];

  for (let i = 1; i <= 50; i++) {
    it(`Simulated Scenario #${i} passes feasibility and canonical replay`, () => {
      // 1. Generate random battery
      const capacity = Math.round(150 + rand() * 350); // 150 - 500 kWh
      const minReserve = Math.round(20 + rand() * 40); // 20 - 60 kWh
      const initial = Math.round(minReserve + rand() * (capacity - minReserve) * 0.7);
      const maxCharge = Math.round(50 + rand() * 70);
      const maxDischarge = Math.round(50 + rand() * 70);

      const battery: Battery = {
        capacity_kwh: capacity,
        initial_energy_kwh: initial,
        minimum_energy_kwh: minReserve,
        max_charge_kwh_per_hour: maxCharge,
        max_discharge_kwh_per_hour: maxDischarge,
      };

      // 2. Select 1 to 3 random operator notes
      const noteCount = 1 + Math.floor(rand() * 3);
      const selectedNotes: string[] = [];
      for (let n = 0; n < noteCount; n++) {
        const noteIdx = Math.floor(rand() * sampleDirectives.length);
        selectedNotes.push(sampleDirectives[noteIdx]!);
      }

      // 3. Generate 24 hours of demand, solar, and tariffs
      const hasGridCap = selectedNotes.some((n) => n.includes("Limit grid draw to 150"));
      const hours: HourEntry[] = [];
      for (let h = 0; h < 24; h++) {
        // Base demand curve
        let maxAllowedDemand = 350;
        if (hasGridCap && h >= 17 && h <= 20) {
          // Keep demand within grid cap (150) + discharge capacity
          maxAllowedDemand = 150 + maxDischarge - 10;
        }

        const baseDemand = 80 + Math.sin((h / 24) * Math.PI * 2 - Math.PI / 2) * 50 + rand() * 80;
        const demand = Math.round(Math.max(50, Math.min(maxAllowedDemand, baseDemand)) * 10) / 10;

        // Solar curve (bell curve 6 AM to 6 PM)
        let solar = 0;
        if (h >= 6 && h <= 18) {
          solar = Math.round(Math.sin(((h - 6) / 12) * Math.PI) * (100 + rand() * 180) * 10) / 10;
        }

        // Realistic tariff (higher during evening peak 17-21)
        let tariff = 7;
        if (h >= 17 && h <= 21) tariff = 22 + Math.round(rand() * 8);
        else if (h >= 8 && h <= 16) tariff = 13 + Math.round(rand() * 5);
        else tariff = 6 + Math.round(rand() * 2);

        hours.push({
          hour: h,
          demand_kwh: demand,
          solar_kwh: solar,
          tariff_bdt_per_kwh: tariff,
        });
      }

      // 4. Interpret via emergency parser (deterministic heuristic simulation)
      const rawDirectives = parseEmergencyDirectives(selectedNotes, battery);
      const trustedDirectives = applyGuardrails(rawDirectives, selectedNotes.length, battery);

      // 5. Solve via simplex LP optimizer
      const solved = solveSchedule(hours, battery, trustedDirectives);

      // 6. Independent replay validator
      const totals = replayAndValidate(hours, battery, trustedDirectives, solved.hourlyPlan);

      expect(solved.hourlyPlan).toHaveLength(24);
      expect(totals.totalGridKwh).toBeGreaterThanOrEqual(0);
      expect(totals.totalCostBdt).toBeGreaterThanOrEqual(0);
      expect(totals.peakGridKwh).toBeGreaterThanOrEqual(0);
    });
  }
});
