import { describe, expect, it } from "vitest";

import { applyGuardrails } from "@/lib/guardrails";
import type { RawDirective } from "@/lib/schemas";
import type { Battery } from "@/types/gridwise";

const battery: Battery = {
  capacity_kwh: 500,
  initial_energy_kwh: 200,
  minimum_energy_kwh: 50,
  max_charge_kwh_per_hour: 100,
  max_discharge_kwh_per_hour: 100,
};

function raw(partial: Partial<RawDirective>): RawDirective {
  return {
    note_index: 0,
    applies: true,
    directive_type: "no_op",
    structured_adjustment: null,
    explanation: "",
    ...partial,
  };
}

describe("applyGuardrails", () => {
  it("passes through a valid solar_reduction directive and normalizes hours", () => {
    const result = applyGuardrails(
      [raw({ directive_type: "solar_reduction", structured_adjustment: { hours: [14, 13, 13], factor: 0.2 } })],
      1,
      battery
    );
    expect(result).toEqual([
      {
        note_index: 0,
        applies: true,
        directive_type: "solar_reduction",
        structured_adjustment: { hours: [13, 14], factor: 0.2 },
        explanation: "",
      },
    ]);
  });

  it("fills in a safe no_op when a note has no interpretation at all", () => {
    const result = applyGuardrails([], 2, battery);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ note_index: 0, applies: false, directive_type: "no_op", structured_adjustment: null });
    expect(result[1]).toMatchObject({ note_index: 1, applies: false, directive_type: "no_op", structured_adjustment: null });
  });

  it("degrades an unsupported directive_type to no_op instead of passing it through", () => {
    const result = applyGuardrails([raw({ directive_type: "shutdown_campus" as any, structured_adjustment: {} })], 1, battery);
    expect(result[0]).toMatchObject({ applies: false, directive_type: "no_op" });
  });

  it("rejects a solar_reduction factor outside [0,1] and falls back to no_op", () => {
    const result = applyGuardrails(
      [raw({ directive_type: "solar_reduction", structured_adjustment: { hours: [10], factor: 1.5 } })],
      1,
      battery
    );
    expect(result[0]).toMatchObject({ applies: false, directive_type: "no_op" });
  });

  it("rejects a minimum_battery_reserve above battery capacity", () => {
    const result = applyGuardrails(
      [
        raw({
          directive_type: "minimum_battery_reserve",
          structured_adjustment: { hours: [1, 2], minimum_energy_kwh: 9999 },
        }),
      ],
      1,
      battery
    );
    expect(result[0]).toMatchObject({ applies: false, directive_type: "no_op" });
  });

  it("ignores an out-of-range note_index and still fills the real note with no_op", () => {
    const result = applyGuardrails([raw({ note_index: 5 })], 1, battery);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ note_index: 0, applies: false, directive_type: "no_op" });
  });

  it("keeps the first mapping when a note_index is duplicated", () => {
    const result = applyGuardrails(
      [
        raw({ note_index: 0, directive_type: "no_charge_window", structured_adjustment: { hours: [1] } }),
        raw({ note_index: 0, directive_type: "no_discharge_window", structured_adjustment: { hours: [2] } }),
      ],
      1,
      battery
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.directive_type).toBe("no_charge_window");
  });

  it("always forces applies=false + null adjustment for no_op regardless of what the model sent", () => {
    const result = applyGuardrails(
      [raw({ directive_type: "no_op", applies: true, structured_adjustment: { hours: [1] } as any })],
      1,
      battery
    );
    expect(result[0]).toMatchObject({ applies: false, directive_type: "no_op", structured_adjustment: null });
  });

  it("returns exactly noteCount entries in ascending note_index order regardless of input order", () => {
    const result = applyGuardrails(
      [raw({ note_index: 2 }), raw({ note_index: 0 }), raw({ note_index: 1 })],
      3,
      battery
    );
    expect(result.map((d) => d.note_index)).toEqual([0, 1, 2]);
  });
});
