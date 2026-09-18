// Prompt template for the LLM Interpreter stage. One call per request,
// covering all 1-3 operator notes at once (keeps us well inside the 30s
// per-request / 5s p95 latency budget).
//
// The model's output is UNTRUSTED. guardrails.ts is the real enforcement
// layer; this prompt only exists to make the model's first guess as
// accurate as possible.

export const SYSTEM_PROMPT = `You are the operator-note interpreter for GridWise, a campus energy
optimization system. You read short natural-language notes from campus
operators and convert each one into a structured directive that a
downstream math optimizer can apply to a 24-hour energy schedule.

You must classify every note into exactly one of these six directive types:

1. solar_reduction - usable solar drops during specific hours.
   structured_adjustment: {"hours": [int...], "factor": number}
   "factor" is the USABLE FRACTION THAT REMAINS, not the fraction removed.
   Example: "output drops to 20%" -> factor 0.2. "an 80% reduction" -> factor 0.2 (100% - 80% = 20% remains).

2. minimum_battery_reserve - battery energy must stay at or above a level during specific hours.
   structured_adjustment: {"hours": [int...], "minimum_energy_kwh": number}

3. no_charge_window - battery charging is unavailable during specific hours.
   structured_adjustment: {"hours": [int...]}

4. no_discharge_window - battery discharging is unavailable during specific hours.
   structured_adjustment: {"hours": [int...]}

5. max_grid_window - grid import may not exceed a stated amount during specific hours.
   structured_adjustment: {"hours": [int...], "max_grid_kwh": number}

6. no_op - the note does NOT affect today's 24-hour energy schedule (distractor,
   unrelated campus news, or something with no defined mechanical effect above).
   structured_adjustment: null

Hour convention: hours are whole numbers 0-23. A time window is START-INCLUSIVE,
END-EXCLUSIVE. "1 PM to 3 PM" means the hours [13, 14] (NOT 15). Always return
the hours array as unique integers in ascending order.

Notes may paraphrase the same directive in different wording, using clock times,
percentages, or descriptive language ("roughly a fifth of normal output" means
factor 0.2). Interpret MEANING, not exact phrasing. Never invent a directive type
that is not in the list of six above. Never change demand, tariff, or battery
capacity/rate numbers yourself - only the six mechanisms above may affect the
schedule, and only through their defined fields.

Respond with ONLY a JSON array, one object per operator note, in the same order
the notes were given (note_index 0, 1, 2, ...). Each object has exactly these
fields: note_index (integer), applies (boolean), directive_type (one of the six
strings above), structured_adjustment (object matching the type above, or null
only for no_op), explanation (a short, one-sentence reason).

For no_op: applies MUST be false and structured_adjustment MUST be null.
For every other directive_type: applies MUST be true and structured_adjustment
MUST be a non-null object with exactly the fields listed for that type.

Do not include markdown code fences, comments, or any text outside the JSON array.`;

export interface FewShotExample {
  notes: string[];
  response: string;
}

// A few worked examples spanning: a clear directive, a clear distractor, and a
// paraphrase (different wording than the Problem Statement's own examples) so
// the model locks onto meaning rather than memorized phrasing.
export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    notes: [
      "Facilities are power-washing the rooftop panels between 1pm and 3pm, expect only a fifth of normal solar during that window.",
      "The student union elections were postponed to next semester.",
    ],
    response: JSON.stringify([
      {
        note_index: 0,
        applies: true,
        directive_type: "solar_reduction",
        structured_adjustment: { hours: [13, 14], factor: 0.2 },
        explanation: "Panel washing leaves roughly 20% of normal solar output from 1-3 PM.",
      },
      {
        note_index: 1,
        applies: false,
        directive_type: "no_op",
        structured_adjustment: null,
        explanation: "Election scheduling has no effect on the energy schedule.",
      },
    ]),
  },
  {
    notes: ["Please hold at least 150 kWh in the battery from 6 PM to 10 PM in case of a grid maintenance cut."],
    response: JSON.stringify([
      {
        note_index: 0,
        applies: true,
        directive_type: "minimum_battery_reserve",
        structured_adjustment: { hours: [18, 19, 20, 21], minimum_energy_kwh: 150 },
        explanation: "Operator wants a 150 kWh floor in reserve from 6 PM through 9 PM inclusive.",
      },
    ]),
  },
  {
    notes: [
      "Grid maintenance means we can't draw more than 40 kWh per hour from the grid between 8 AM and 10 AM.",
      "Battery charging must be paused overnight from midnight to 2 AM for a firmware update.",
    ],
    response: JSON.stringify([
      {
        note_index: 0,
        applies: true,
        directive_type: "max_grid_window",
        structured_adjustment: { hours: [8, 9], max_grid_kwh: 40 },
        explanation: "Grid import is capped at 40 kWh/hour during the 8-10 AM maintenance window.",
      },
      {
        note_index: 1,
        applies: true,
        directive_type: "no_charge_window",
        structured_adjustment: { hours: [0, 1] },
        explanation: "Firmware update forbids charging from midnight to 2 AM.",
      },
    ]),
  },
];

export function buildUserPrompt(operatorNotes: string[]): string {
  const numbered = operatorNotes.map((note, i) => `${i}: ${note}`).join("\n");
  return `Operator notes for this scenario:\n${numbered}\n\nReturn the JSON array now.`;
}
