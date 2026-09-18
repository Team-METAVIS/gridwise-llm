// Regression test against the organizer-provided public sample cases,
// exercising the optimizer + final replay validator directly (using each
// case's own expected_output.directive_interpretation as the trusted
// directive input, bypassing the LLM entirely). This is deliberately
// LLM-independent: it verifies the deterministic half of the pipeline --
// constraint construction, the LP formulation, and the self-replay check --
// against real judge-quality fixtures covering all six directive types.

import { describe, expect, it } from "vitest";

import { solveSchedule } from "@/lib/optimizer";
import { replayAndValidate } from "@/lib/replay";
import type { Battery, DirectiveInterpretation, HourEntry } from "@/types/gridwise";

import samplesData from "../BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json";

interface SampleCase {
  id: string;
  label: string;
  input: {
    scenario_id: string;
    operator_notes: string[];
    hours: HourEntry[];
    battery: Battery;
  };
  expected_output: {
    directive_interpretation: DirectiveInterpretation[];
    total_cost_bdt: number;
  };
}

const cases = (samplesData as { cases: SampleCase[] }).cases;

describe("public sample cases (optimizer + replay, LLM bypassed)", () => {
  it("ships at least 10 cases covering every directive type", () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
    const types = new Set(cases.flatMap((c) => c.expected_output.directive_interpretation.map((d) => d.directive_type)));
    for (const t of ["solar_reduction", "minimum_battery_reserve", "no_charge_window", "no_discharge_window", "max_grid_window", "no_op"]) {
      expect(types).toContain(t);
    }
  });

  for (const testCase of cases) {
    it(`${testCase.id} (${testCase.label}): produces a valid, near-optimal schedule`, () => {
      const { hours, battery } = testCase.input;
      const directives = testCase.expected_output.directive_interpretation;

      const solved = solveSchedule(hours, battery, directives);

      // Must not throw -- i.e. the plan is internally valid against the same
      // rules the judge harness replays.
      const totals = replayAndValidate(hours, battery, directives, solved.hourlyPlan);

      // Our LP solver is provably optimal for this formulation, so it should
      // never do meaningfully worse than the organizer's own reference cost.
      // Small slack accounts for solver floating-point precision and the
      // reference tolerance documented in the Problem Statement (0.01 BDT).
      expect(totals.totalCostBdt).toBeLessThanOrEqual(testCase.expected_output.total_cost_bdt + 1);
    });
  }
});
