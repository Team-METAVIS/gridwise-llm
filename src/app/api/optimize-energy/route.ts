import { applyGuardrails } from "@/lib/guardrails";
import { interpretOperatorNotes } from "@/lib/llm/gateway";
import { solveSchedule } from "@/lib/optimizer";
import { replayAndValidate } from "@/lib/replay";
import { optimizeEnergyRequestSchema } from "@/lib/schemas";
import type { OptimizeEnergyResponse } from "@/types/gridwise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Problem Statement §06.1: POST /optimize-energy must complete within 30s.
// Vercel Hobby's default function timeout is shorter than that, so this
// route config raises the ceiling to match our own budget.
export const maxDuration = 30;

function errorResponse(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Request body is not valid JSON.");
  }

  const parsed = optimizeEnergyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, `Request does not match the required schema: ${parsed.error.message}`);
  }
  const { scenario_id, operator_notes, hours, battery } = parsed.data;

  // 1. LLM Interpreter (never throws -- ok:false degrades to safe no_op below).
  const interpretation = await interpretOperatorNotes(operator_notes);
  const rawDirectives = interpretation.ok ? interpretation.raw : [];
  if (!interpretation.ok) {
    console.warn(`[optimize-energy] ${scenario_id}: LLM interpretation unavailable (${interpretation.error}); falling back to no_op for all notes.`);
  }

  // 2. Guardrail Validator: untrusted raw directives -> trusted, complete,
  //    note_index-ordered directive_interpretation.
  const directiveInterpretation = applyGuardrails(rawDirectives, operator_notes.length, battery);

  // 3. Math Optimizer + 4. Final Validator (self-replay).
  let totals;
  let hourlyPlan;
  try {
    const solved = solveSchedule(hours, battery, directiveInterpretation);
    hourlyPlan = solved.hourlyPlan;
    totals = replayAndValidate(hours, battery, directiveInterpretation, hourlyPlan);
  } catch (err) {
    console.error(`[optimize-energy] ${scenario_id}: optimizer/replay failed:`, err);
    return errorResponse(500, "Could not produce a valid schedule for this scenario.");
  }

  const appliedCount = directiveInterpretation.filter((d) => d.applies).length;
  const plan_summary = `Scheduled ${totals.totalGridKwh} kWh of grid import at a total cost of ${totals.totalCostBdt} BDT (peak ${totals.peakGridKwh} kWh in a single hour), applying ${appliedCount} of ${operator_notes.length} operator directive(s).`;

  const response: OptimizeEnergyResponse = {
    scenario_id,
    directive_interpretation: directiveInterpretation,
    hourly_plan: hourlyPlan,
    total_grid_kwh: totals.totalGridKwh,
    total_cost_bdt: totals.totalCostBdt,
    peak_grid_kwh: totals.peakGridKwh,
    plan_summary,
  };

  return Response.json(response, { status: 200 });
}
