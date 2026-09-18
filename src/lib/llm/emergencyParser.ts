/**
 * Emergency Heuristic Parser for Operator Notes
 * BUP CSE Fest 2026 Hackathon (Team Metavis)
 *
 * Provides deterministic pattern-matching recovery if LLM providers are
 * unavailable, timeout, or hit rate-limits, ensuring critical operational
 * instructions are not silently lost to no_op.
 *
 * Output is still validated by guardrails.ts to guarantee boundary safety.
 */

import type { Battery } from "@/types/gridwise";
import type { RawDirective } from "@/lib/schemas";

function parseHoursWindow(text: string): number[] | null {
  const lower = text.toLowerCase();

  // Pattern: "X pm to Y pm", "X am to Y pm", "between X and Y", etc.
  const timeRegex = /(?:from|between)\s+(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*(?:to|and|-)\s*(\d{1,2})(?::\d{2})?\s*(am|pm)?/i;
  const match = lower.match(timeRegex);
  if (match) {
    let startVal = parseInt(match[1]!, 10);
    const startAmPm = match[2]?.toLowerCase();
    let endVal = parseInt(match[3]!, 10);
    const endAmPm = match[4]?.toLowerCase() || startAmPm;

    if (startAmPm === "pm" && startVal < 12) startVal += 12;
    if (startAmPm === "am" && startVal === 12) startVal = 0;
    if (endAmPm === "pm" && endVal < 12) endVal += 12;
    if (endAmPm === "am" && endVal === 12) endVal = 0;

    if (startVal >= 0 && startVal < 24 && endVal > startVal && endVal <= 24) {
      const hours: number[] = [];
      for (let h = startVal; h < endVal; h++) {
        hours.push(h);
      }
      return hours.length > 0 ? hours : null;
    }
  }

  // Named time of day windows
  if (lower.includes("evening")) return [17, 18, 19, 20];
  if (lower.includes("morning")) return [8, 9, 10, 11];
  if (lower.includes("afternoon")) return [12, 13, 14, 15];
  if (lower.includes("night")) return [20, 21, 22, 23];

  return null;
}

function parsePercentage(text: string): number | null {
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    return parseFloat(pctMatch[1]!) / 100;
  }
  const fractionMatch = text.toLowerCase();
  if (fractionMatch.includes("one fifth") || fractionMatch.includes("1/5")) return 0.2;
  if (fractionMatch.includes("one fourth") || fractionMatch.includes("quarter") || fractionMatch.includes("1/4")) return 0.25;
  if (fractionMatch.includes("one third") || fractionMatch.includes("1/3")) return 0.3333;
  if (fractionMatch.includes("half") || fractionMatch.includes("1/2")) return 0.5;
  return null;
}

export function parseEmergencyDirective(
  note: string,
  noteIndex: number,
  battery?: Battery
): RawDirective {
  const lower = note.toLowerCase();

  // 1. Solar reduction
  if (lower.includes("solar") || lower.includes("pv")) {
    if (
      lower.includes("drop") ||
      lower.includes("reduc") ||
      lower.includes("limit") ||
      lower.includes("curtail") ||
      lower.includes("down") ||
      lower.includes("%") ||
      lower.includes("fifth")
    ) {
      const factor = parsePercentage(note) ?? 0.2;
      const hours = parseHoursWindow(note) ?? [12, 13, 14];
      return {
        note_index: noteIndex,
        applies: true,
        directive_type: "solar_reduction",
        structured_adjustment: { hours, factor },
        explanation: `[emergency-fallback] Parsed solar reduction to ${Math.round(factor * 100)}% for hours [${hours.join(", ")}].`,
      };
    }
  }

  // 2. No charge window
  if (
    (lower.includes("not charge") ||
      lower.includes("no charge") ||
      lower.includes("cannot charge") ||
      lower.includes("don't charge") ||
      lower.includes("stop charge") ||
      lower.includes("charging forbidden") ||
      lower.includes("pause charging")) &&
    !lower.includes("discharge")
  ) {
    const hours = parseHoursWindow(note);
    if (hours) {
      return {
        note_index: noteIndex,
        applies: true,
        directive_type: "no_charge_window",
        structured_adjustment: { hours },
        explanation: `[emergency-fallback] Parsed no-charge window for hours [${hours.join(", ")}].`,
      };
    }
  }

  // 3. No discharge window
  if (
    lower.includes("not discharge") ||
    lower.includes("no discharge") ||
    lower.includes("cannot discharge") ||
    lower.includes("don't discharge") ||
    lower.includes("stop discharge") ||
    lower.includes("discharging forbidden") ||
    lower.includes("pause discharging")
  ) {
    const hours = parseHoursWindow(note);
    if (hours) {
      return {
        note_index: noteIndex,
        applies: true,
        directive_type: "no_discharge_window",
        structured_adjustment: { hours },
        explanation: `[emergency-fallback] Parsed no-discharge window for hours [${hours.join(", ")}].`,
      };
    }
  }

  // 4. Minimum battery reserve
  if (lower.includes("reserve") || lower.includes("keep") || lower.includes("store")) {
    const pct = parsePercentage(note);
    let minimum_energy_kwh: number | null = null;
    if (pct !== null && battery) {
      minimum_energy_kwh = Math.round(battery.capacity_kwh * pct);
    } else {
      const kwhMatch = note.match(/(\d+(?:\.\d+)?)\s*kwh/i);
      if (kwhMatch) minimum_energy_kwh = parseFloat(kwhMatch[1]!);
    }

    if (minimum_energy_kwh !== null) {
      const hours = parseHoursWindow(note) ?? [18, 19, 20, 21];
      return {
        note_index: noteIndex,
        applies: true,
        directive_type: "minimum_battery_reserve",
        structured_adjustment: { hours, minimum_energy_kwh },
        explanation: `[emergency-fallback] Parsed minimum battery reserve of ${minimum_energy_kwh} kWh for hours [${hours.join(", ")}].`,
      };
    }
  }

  // 5. Max grid window
  if (lower.includes("grid") && (lower.includes("limit") || lower.includes("cap") || lower.includes("max") || lower.includes("draw"))) {
    const kwhMatch = note.match(/(\d+(?:\.\d+)?)\s*(?:kwh|kw)/i);
    if (kwhMatch) {
      const max_grid_kwh = parseFloat(kwhMatch[1]!);
      const hours = parseHoursWindow(note) ?? Array.from({ length: 24 }, (_, i) => i);
      return {
        note_index: noteIndex,
        applies: true,
        directive_type: "max_grid_window",
        structured_adjustment: { hours, max_grid_kwh },
        explanation: `[emergency-fallback] Parsed grid import cap of ${max_grid_kwh} kWh for hours [${hours.join(", ")}].`,
      };
    }
  }

  // 6. Default to no_op
  return {
    note_index: noteIndex,
    applies: false,
    directive_type: "no_op",
    structured_adjustment: null,
    explanation: "[emergency-fallback] Note did not contain actionable scheduling constraints or is a distractor.",
  };
}

export function parseEmergencyDirectives(
  notes: string[],
  battery?: Battery
): RawDirective[] {
  return notes.map((note, idx) => parseEmergencyDirective(note, idx, battery));
}
