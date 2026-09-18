// Deterministic guardrail validator (Problem Statement §08). LLM output is
// untrusted structured data until it passes every check here. Nothing in
// this file ever invents a new directive type or a numeric value the model
// didn't provide -- when a raw entry can't be trusted, the safe fallback is
// always `no_op` for that single note, never a crash and never a guess.

import type { RawDirective } from "@/lib/schemas";
import {
  DIRECTIVE_TYPES,
  type Battery,
  type DirectiveInterpretation,
  type DirectiveType,
  type StructuredAdjustment,
} from "@/types/gridwise";

function safeNoOp(noteIndex: number, reason: string): DirectiveInterpretation {
  return {
    note_index: noteIndex,
    applies: false,
    directive_type: "no_op",
    structured_adjustment: null,
    explanation: reason,
  };
}

function isDirectiveType(value: string): value is DirectiveType {
  return (DIRECTIVE_TYPES as readonly string[]).includes(value);
}

/** Normalizes an hours array: unique, ascending, integer, strictly within [0, 23].
 * Returns null if the array is empty or contains ANY non-integer or out-of-range value (0-23). */
function normalizeHours(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  for (const h of raw) {
    if (typeof h !== "number" || !Number.isInteger(h) || h < 0 || h > 23) {
      return null;
    }
  }
  const cleaned = Array.from(new Set(raw as number[])).sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : null;
}

function validateAdjustment(
  type: Exclude<DirectiveType, "no_op">,
  raw: RawDirective["structured_adjustment"],
  battery: Battery
): StructuredAdjustment | null {
  if (!raw) return null;
  const hours = normalizeHours(raw.hours);
  if (!hours) return null;

  switch (type) {
    case "solar_reduction": {
      if (typeof raw.factor !== "number" || !Number.isFinite(raw.factor)) return null;
      if (raw.factor < 0 || raw.factor > 1) return null;
      return { hours, factor: raw.factor };
    }
    case "minimum_battery_reserve": {
      if (typeof raw.minimum_energy_kwh !== "number" || !Number.isFinite(raw.minimum_energy_kwh)) return null;
      if (raw.minimum_energy_kwh < 0 || raw.minimum_energy_kwh > battery.capacity_kwh) return null;
      return { hours, minimum_energy_kwh: raw.minimum_energy_kwh };
    }
    case "no_charge_window":
      return { hours };
    case "no_discharge_window":
      return { hours };
    case "max_grid_window": {
      if (typeof raw.max_grid_kwh !== "number" || !Number.isFinite(raw.max_grid_kwh)) return null;
      if (raw.max_grid_kwh < 0) return null;
      return { hours, max_grid_kwh: raw.max_grid_kwh };
    }
  }
}

/**
 * Converts untrusted raw LLM directive candidates into a trusted, complete,
 * note_index-ordered directive_interpretation array. Guarantees:
 *  - exactly one entry per note, in ascending note_index order,
 *  - no_op <=> applies=false + structured_adjustment=null,
 *  - every other type <=> applies=true + a shape-correct structured_adjustment,
 *  - any raw entry that can't be trusted degrades to a no_op for that note
 *    rather than being applied or crashing the request.
 */
export function applyGuardrails(raw: RawDirective[], noteCount: number, battery: Battery): DirectiveInterpretation[] {
  const byIndex = new Map<number, RawDirective>();
  for (const entry of raw) {
    if (!Number.isInteger(entry.note_index) || entry.note_index < 0 || entry.note_index >= noteCount) {
      continue; // out-of-range mapping: ignored, that note falls back to no_op below.
    }
    if (!byIndex.has(entry.note_index)) {
      byIndex.set(entry.note_index, entry); // first mapping wins on duplicates.
    }
  }

  const result: DirectiveInterpretation[] = [];
  for (let i = 0; i < noteCount; i++) {
    const candidate = byIndex.get(i);
    if (!candidate) {
      result.push(safeNoOp(i, "No valid interpretation was returned for this note; treated as no_op."));
      continue;
    }

    if (!isDirectiveType(candidate.directive_type)) {
      result.push(safeNoOp(i, "Model returned an unsupported directive type; treated as no_op."));
      continue;
    }

    if (candidate.directive_type === "no_op") {
      result.push(safeNoOp(i, candidate.explanation || "This note does not affect today's energy schedule."));
      continue;
    }

    const adjustment = validateAdjustment(candidate.directive_type, candidate.structured_adjustment, battery);
    if (!adjustment) {
      result.push(
        safeNoOp(i, `Model's "${candidate.directive_type}" adjustment failed validation; treated as no_op.`)
      );
      continue;
    }

    result.push({
      note_index: i,
      applies: true,
      directive_type: candidate.directive_type,
      structured_adjustment: adjustment,
      explanation: candidate.explanation || "",
    });
  }

  return result;
}
