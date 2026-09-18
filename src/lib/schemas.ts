import { z } from "zod";
import { DIRECTIVE_TYPES } from "@/types/gridwise";

// ---------------------------------------------------------------------------
// Request schema (Problem Statement §07). Failing this -> HTTP 400.
// ---------------------------------------------------------------------------

const hourEntrySchema = z.object({
  hour: z.number().int().min(0).max(23),
  demand_kwh: z.number().finite().nonnegative(),
  solar_kwh: z.number().finite().nonnegative(),
  tariff_bdt_per_kwh: z.number().finite().nonnegative(),
});

const batterySchema = z.object({
  capacity_kwh: z.number().finite().positive(),
  initial_energy_kwh: z.number().finite().nonnegative(),
  minimum_energy_kwh: z.number().finite().nonnegative(),
  max_charge_kwh_per_hour: z.number().finite().nonnegative(),
  max_discharge_kwh_per_hour: z.number().finite().nonnegative(),
});

export const optimizeEnergyRequestSchema = z
  .object({
    scenario_id: z.string().trim().min(1),
    operator_notes: z.array(z.string().trim().min(1)).min(1).max(3),
    hours: z.array(hourEntrySchema).length(24),
    battery: batterySchema,
  })
  .superRefine((val, ctx) => {
    const seen = new Set<number>();
    for (const h of val.hours) {
      if (seen.has(h.hour)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate hour ${h.hour} in "hours" array`,
        });
      }
      seen.add(h.hour);
    }
    for (let i = 0; i < 24; i++) {
      if (!seen.has(i)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing hour ${i} in "hours" array`,
        });
      }
    }
    if (val.battery.minimum_energy_kwh > val.battery.capacity_kwh) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "battery.minimum_energy_kwh cannot exceed battery.capacity_kwh",
      });
    }
    if (val.battery.initial_energy_kwh > val.battery.capacity_kwh) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "battery.initial_energy_kwh cannot exceed battery.capacity_kwh",
      });
    }
    if (val.battery.initial_energy_kwh < val.battery.minimum_energy_kwh) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "battery.initial_energy_kwh cannot be less than battery.minimum_energy_kwh",
      });
    }
  });

// ---------------------------------------------------------------------------
// Response schema (Problem Statement §10). Validates outgoing API response.
// ---------------------------------------------------------------------------

const hourlyPlanEntrySchema = z.object({
  hour: z.number().int().min(0).max(23),
  grid_kwh: z.number().finite().nonnegative(),
  solar_used_kwh: z.number().finite().nonnegative(),
  battery_action: z.enum(["charge", "discharge", "idle"]),
  battery_kwh: z.number().finite().nonnegative(),
  battery_energy_after_kwh: z.number().finite().nonnegative(),
});

const directiveInterpretationEntrySchema = z.object({
  note_index: z.number().int().nonnegative(),
  applies: z.boolean(),
  directive_type: z.enum(DIRECTIVE_TYPES),
  structured_adjustment: z
    .object({
      hours: z.array(z.number().int().min(0).max(23)).optional(),
      factor: z.number().finite().min(0).max(1).optional(),
      minimum_energy_kwh: z.number().finite().nonnegative().optional(),
      max_grid_kwh: z.number().finite().nonnegative().optional(),
    })
    .nullable(),
  explanation: z.string(),
});

export const optimizeEnergyResponseSchema = z.object({
  scenario_id: z.string().min(1),
  directive_interpretation: z.array(directiveInterpretationEntrySchema),
  hourly_plan: z.array(hourlyPlanEntrySchema).length(24),
  total_grid_kwh: z.number().finite().nonnegative(),
  total_cost_bdt: z.number().finite().nonnegative(),
  peak_grid_kwh: z.number().finite().nonnegative(),
  plan_summary: z.string(),
});


// ---------------------------------------------------------------------------
// Raw LLM output schema — deliberately loose. This is the *untrusted* shape
// we ask the model for; guardrails.ts re-validates every field against the
// real request (note count, hour range, battery capacity) before anything
// reaches the optimizer. Never trust this schema alone.
// ---------------------------------------------------------------------------

export const rawDirectiveSchema = z.object({
  note_index: z.number().int(),
  applies: z.boolean(),
  directive_type: z.string(),
  structured_adjustment: z
    .object({
      hours: z.array(z.number()).optional(),
      factor: z.number().optional(),
      minimum_energy_kwh: z.number().optional(),
      max_grid_kwh: z.number().optional(),
    })
    .nullable(),
  explanation: z.string().optional().default(""),
});

export const rawDirectiveArraySchema = z.array(rawDirectiveSchema);

export type RawDirective = z.infer<typeof rawDirectiveSchema>;

export const isKnownDirectiveType = (value: string): value is (typeof DIRECTIVE_TYPES)[number] =>
  (DIRECTIVE_TYPES as readonly string[]).includes(value);
