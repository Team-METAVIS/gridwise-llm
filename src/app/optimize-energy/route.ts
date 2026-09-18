import { applyGuardrails } from "@/lib/guardrails";
import { interpretOperatorNotes } from "@/lib/llm/gateway";
import { solveSchedule } from "@/lib/optimizer";
import { replayAndValidate } from "@/lib/replay";
import { optimizeEnergyRequestSchema, optimizeEnergyResponseSchema } from "@/lib/schemas";
import type { OptimizeEnergyResponse } from "@/types/gridwise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Problem Statement §06.1: POST /optimize-energy must complete within 30s.
// Raises the ceiling to match our 30-second budget.
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

  // 1. LLM Interpreter with full battery context (never throws -- ok:false degrades to safe no_op).
  const interpretation = await interpretOperatorNotes(operator_notes, battery);
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
  const chargedHours = hourlyPlan.filter((h) => h.battery_action === "charge").length;
  const dischargedHours = hourlyPlan.filter((h) => h.battery_action === "discharge").length;
  const totalSolarUsed = Math.round(hourlyPlan.reduce((sum, h) => sum + h.solar_used_kwh, 0));

  const strategyDetails: string[] = [];
  if (totalSolarUsed > 0) strategyDetails.push(`maximized ${totalSolarUsed} kWh on-site solar`);
  if (chargedHours > 0) strategyDetails.push(`charged battery across ${chargedHours} off-peak hour(s)`);
  if (dischargedHours > 0) strategyDetails.push(`discharged battery across ${dischargedHours} peak hour(s) to offset grid cost`);
  if (appliedCount > 0) {
    const activeTypes = Array.from(new Set(directiveInterpretation.filter((d) => d.applies).map((d) => d.directive_type.replace(/_/g, " ")))).join(", ");
    strategyDetails.push(`enforced constraints (${activeTypes})`);
  }

  const strategySuffix = strategyDetails.length > 0 ? ` Strategy: ${strategyDetails.join("; ")}.` : "";
  const plan_summary = `Scheduled ${totals.totalGridKwh} kWh of grid import at a total cost of ${totals.totalCostBdt} BDT (peak ${totals.peakGridKwh} kWh in a single hour), applying ${appliedCount} of ${operator_notes.length} operator directive(s).${strategySuffix}`;

  const response: OptimizeEnergyResponse = {
    scenario_id,
    directive_interpretation: directiveInterpretation,
    hourly_plan: hourlyPlan,
    total_grid_kwh: totals.totalGridKwh,
    total_cost_bdt: totals.totalCostBdt,
    peak_grid_kwh: totals.peakGridKwh,
    plan_summary,
  };

  // 5. Outgoing Schema Validation
  const validatedResponse = optimizeEnergyResponseSchema.safeParse(response);
  if (!validatedResponse.success) {
    console.error(`[optimize-energy] ${scenario_id}: outgoing response failed schema validation:`, validatedResponse.error.message);
    return errorResponse(500, "Internal error: generated plan failed response validation.");
  }

  return Response.json(validatedResponse.data, { status: 200 });
}
