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
   "factor" is the USABLE FRACTION THAT REMAINS (between 0.0 and 1.0), not the fraction removed.
   - "output drops to 20%" or "usable solar is roughly 25%" -> factor is the stated remaining fraction (0.2 or 0.25).
   - "an 80% reduction" or "80% drop in solar" -> factor is 0.2 (100% - 80% = 20% remains).
   - "leaves about half of forecast output" -> factor 0.5.
   - "one fifth of normal solar remains" -> factor 0.2.
   - "three quarters lost" -> factor 0.25 (1 - 0.75 = 0.25 remains).

2. minimum_battery_reserve - battery energy must stay at or above a stated level during specific hours.
   structured_adjustment: {"hours": [int...], "minimum_energy_kwh": number}
   - If stated in absolute kWh (e.g. "at least 120 kWh in reserve"), minimum_energy_kwh is 120.
   - If stated as a percentage of battery capacity (e.g. "at least 50% of the battery capacity"),
     multiply that percentage by the battery capacity provided in the user prompt.
     Example: if battery capacity is 200 kWh, 50% capacity means minimum_energy_kwh is 100.

3. no_charge_window - battery charging is unavailable during specific hours.
   structured_adjustment: {"hours": [int...]}

4. no_discharge_window - battery discharging is unavailable during specific hours.
   structured_adjustment: {"hours": [int...]}

5. max_grid_window - grid import may not exceed a stated amount during specific hours.
   structured_adjustment: {"hours": [int...], "max_grid_kwh": number}

6. no_op - the note does NOT affect today's 24-hour energy schedule.
   structured_adjustment: null
   This includes:
   - General campus news, menu changes, elections, club events.
   - Maintenance or events scheduled for tomorrow, next week, next month, or in the past.
   - Energy meetings or discussions that do not command an immediate physical constraint on today's schedule.

Time window conventions:
- Hours are whole numbers 0 through 23.
- Time intervals are START-INCLUSIVE, END-EXCLUSIVE.
  - "1 PM to 3 PM" (13:00 to 15:00) means hours [13, 14] (NOT 15).
  - "noon until 2 PM" means hours [12, 13].
  - "midnight to 2 AM" means hours [0, 1].
  - "12 AM" = 0, "12 PM" = 12.
- Cross-midnight intervals: If a window wraps past midnight, return all affected hours in ascending order.
  - "11 PM to 1 AM" -> [0, 23].
  - "10 PM to 2 AM" -> [0, 1, 22, 23].
- Always return the hours array as UNIQUE integers in strictly ASCENDING order.

Respond with ONLY a JSON array, one object per operator note, in the exact same order
the notes were given (note_index 0, 1, 2, ...). Each object has exactly these fields:
- "note_index": integer (0, 1, ...)
- "applies": boolean (true for applicable directives, false ONLY for no_op)
- "directive_type": string (one of the six exact strings above)
- "structured_adjustment": object matching the required fields above, or null ONLY for no_op
- "explanation": string (concise explanation)

For no_op: applies MUST be false and structured_adjustment MUST be null.
For every other directive_type: applies MUST be true and structured_adjustment MUST be non-null.

Do not include markdown code fences, comments, or any text outside the JSON array.`;

export interface FewShotExample {
  notes: string[];
  battery?: { capacity_kwh: number; minimum_energy_kwh?: number };
  response: string;
}

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
        explanation: "Election scheduling has no effect on today's energy schedule.",
      },
    ]),
  },
  {
    notes: ["Keep at least 50% of the battery capacity stored in the battery from 6 PM until 9 PM for emergency operations."],
    battery: { capacity_kwh: 200, minimum_energy_kwh: 40 },
    response: JSON.stringify([
      {
        note_index: 0,
        applies: true,
        directive_type: "minimum_battery_reserve",
        structured_adjustment: { hours: [18, 19, 20], minimum_energy_kwh: 100 },
        explanation: "Half of the 200 kWh battery capacity is 100 kWh, which must remain available from 6 PM to 9 PM.",
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

export function buildUserPrompt(
  operatorNotes: string[],
  battery?: { capacity_kwh: number; minimum_energy_kwh?: number }
): string {
  const batteryContext = battery
    ? `Campus Battery Context:\n- Total Capacity: ${battery.capacity_kwh} kWh\n- Base Minimum Reserve: ${battery.minimum_energy_kwh ?? 0} kWh\n\n`
    : "";
  const numbered = operatorNotes.map((note, i) => `${i}: ${note}`).join("\n");
  return `${batteryContext}Operator notes for this scenario:\n${numbered}\n\nReturn the JSON array now.`;
}

