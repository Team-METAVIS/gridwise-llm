import {
  CapabilityRouter,
  CircuitBreaker,
  EventBus,
  QuotaTracker,
  Registry,
} from "@free-ai-gateway/core";

import { DEFAULT_LLM_TIMEOUT_MS } from "@/lib/constants";
import { rawDirectiveArraySchema, type RawDirective } from "@/lib/schemas";
import { interpretViaDirectFetch } from "./directBackend";
import { buildChatMessages, extractJsonArray } from "./messages";
import { parseProviderPriority, PriorityOrderStrategy } from "./priorityStrategy";

export interface InterpretSuccess {
  ok: true;
  raw: RawDirective[];
  servedBy: string;
}

export interface InterpretFailure {
  ok: false;
  error: string;
}

export type InterpretResult = InterpretSuccess | InterpretFailure;

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? DEFAULT_LLM_TIMEOUT_MS);
const configuredBackend = (process.env.LLM_BACKEND || "").trim().toLowerCase();
const FORCE_DIRECT_BACKEND =
  configuredBackend === "direct" ||
  configuredBackend === "openai" ||
  configuredBackend === "groq" ||
  configuredBackend === "gemini" ||
  configuredBackend === "google";

// --- @free-ai-gateway/core wiring (module-level singleton: reused across warm
// serverless invocations, rebuilt on cold start). Construction can throw if
// the package's on-disk provider catalog isn't reachable in this deployment
// (see next.config.mjs comment) -- in that case we fall back to the direct
// backend for the lifetime of this instance instead of crashing every request.
let router: CapabilityRouter | null = null;
let gatewayInitError: string | null = null;

function getRouter(): CapabilityRouter {
  if (router) return router;
  if (gatewayInitError) throw new Error(gatewayInitError);

  try {
    const registry = new Registry();
    const quota = new QuotaTracker();
    const breaker = new CircuitBreaker();
    const eventBus = new EventBus();
    const priority = parseProviderPriority(process.env.LLM_PROVIDER_PRIORITY);

    eventBus.on("request:fallback", (evt: any) => {
      console.warn(`[free-ai-gateway] fallback from ${evt.attemptedProvider}: ${evt.error}`);
    });
    eventBus.on("circuit:opened", (evt: any) => {
      console.warn(`[free-ai-gateway] circuit opened for ${evt.providerId} (${evt.cooldownMs}ms)`);
    });

    router = new CapabilityRouter(registry, quota, breaker, undefined, eventBus, new PriorityOrderStrategy(priority));
    return router;
  } catch (err) {
    gatewayInitError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

import type { Battery } from "@/types/gridwise";

async function callGateway(
  operatorNotes: string[],
  battery?: Battery
): Promise<{ content: string; servedBy: string }> {
  const messages = buildChatMessages(operatorNotes, battery);
  const response = await getRouter().route({
    capabilities: ["text"],
    payload: { messages, temperature: 0 },
    timeoutMs: LLM_TIMEOUT_MS,
  });

  const content = (response.data as any)?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("free-ai-gateway response did not contain choices[0].message.content.");
  }
  return { content, servedBy: `${response.servedBy.provider}/${response.servedBy.model}` };
}

async function callDirect(
  operatorNotes: string[],
  battery?: Battery
): Promise<{ content: string; servedBy: string }> {
  const messages = buildChatMessages(operatorNotes, battery);
  return interpretViaDirectFetch(messages, LLM_TIMEOUT_MS);
}

function parseAndValidate(content: string, expectedCount: number): RawDirective[] {
  const jsonText = extractJsonArray(content);
  const parsed = JSON.parse(jsonText);
  const result = rawDirectiveArraySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Model output failed schema validation: ${result.error.message}`);
  }
  const raw = result.data;
  if (raw.length !== expectedCount) {
    throw new Error(`Model output length (${raw.length}) does not match note count (${expectedCount}).`);
  }
  const seenIndices = new Set<number>();
  for (const d of raw) {
    if (seenIndices.has(d.note_index)) {
      throw new Error(`Duplicate note_index ${d.note_index} in model output.`);
    }
    seenIndices.add(d.note_index);
  }
  for (let i = 0; i < expectedCount; i++) {
    if (!seenIndices.has(i)) {
      throw new Error(`Missing note_index ${i} in model output.`);
    }
  }
  return raw;
}

/**
 * Interprets the operator notes for one scenario into raw (still untrusted)
 * directive candidates. Tries @free-ai-gateway/core first (unless
 * LLM_BACKEND is set to direct/openai), and falls back to the zero-dependency
 * direct-fetch backend. Never throws -- callers get a typed ok:false instead,
 * so a total LLM outage degrades to guardrails.ts's safe no_op fallback
 * rather than crashing the request.
 */
export async function interpretOperatorNotes(
  operatorNotes: string[],
  battery?: Battery
): Promise<InterpretResult> {
  const attempts: Array<() => Promise<{ content: string; servedBy: string }>> = FORCE_DIRECT_BACKEND
    ? [() => callDirect(operatorNotes, battery)]
    : [() => callGateway(operatorNotes, battery), () => callDirect(operatorNotes, battery)];

  let lastError = "Unknown LLM interpretation failure.";
  for (const attempt of attempts) {
    try {
      const { content, servedBy } = await attempt();
      const raw = parseAndValidate(content, operatorNotes.length);
      return { ok: true, raw, servedBy };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[llm-interpreter] attempt failed: ${lastError}`);
    }
  }

  return { ok: false, error: lastError };
}

