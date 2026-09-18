import type { ChatMessage } from "./messages";

export interface DirectBackendResult {
  content: string;
  servedBy: string;
}

import { GEMINI_MODELS, GROQ_MODELS, OPENAI_MODELS } from "@/lib/constants";
export { GEMINI_MODELS, GROQ_MODELS, OPENAI_MODELS };

let groqCallCount = 0;
let geminiCallCount = 0;
let openaiCallCount = 0;

/**
 * Returns candidate models rotated in round-robin order starting from callCount % pool.length.
 */
export function getRotatedModels(pool: string[], callCount: number): string[] {
  if (pool.length === 0) return [];
  const startIndex = Math.abs(callCount) % pool.length;
  return [...pool.slice(startIndex), ...pool.slice(0, startIndex)];
}

/**
 * Resets call counters (primarily used in tests).
 */
export function resetModelCallCounters(): void {
  groqCallCount = 0;
  geminiCallCount = 0;
  openaiCallCount = 0;
}

/**
 * Zero-dependency, plain-`fetch` LLM backend. This is the safety net used
 * when @free-ai-gateway/core cannot be constructed or when LLM_BACKEND=direct
 * or LLM_BACKEND=openai is set explicitly. Supports OpenAI (and compatible APIs),
 * Groq, and Google Gemini with automatic model rotation across calls and in-call
 * fallback on rate-limits/errors when a specific model is not pinned.
 */
export async function interpretViaDirectFetch(
  messages: ChatMessage[],
  timeoutMs: number
): Promise<DirectBackendResult> {
  const backend = (process.env.LLM_BACKEND || "").trim().toLowerCase();

  const providerCallers: Record<string, () => Promise<DirectBackendResult>> = {};

  if (process.env.OPENAI_API_KEY) {
    providerCallers["openai"] = () => callOpenAI(messages, timeoutMs);
  }
  if (process.env.GROQ_API_KEY) {
    providerCallers["groq"] = () => callGroq(messages, timeoutMs);
  }
  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    providerCallers["google"] = () => callGemini(messages, timeoutMs);
    providerCallers["google_ai_studio"] = () => callGemini(messages, timeoutMs);
    providerCallers["gemini"] = () => callGemini(messages, timeoutMs);
  }

  const attempts: Array<() => Promise<DirectBackendResult>> = [];

  // 1. If an explicit direct provider backend was forced via LLM_BACKEND, try it first
  if (backend === "openai" && providerCallers["openai"]) {
    attempts.push(providerCallers["openai"]);
  } else if (backend === "groq" && providerCallers["groq"]) {
    attempts.push(providerCallers["groq"]);
  } else if ((backend === "gemini" || backend === "google") && providerCallers["google"]) {
    attempts.push(providerCallers["google"]);
  }

  // 2. Prioritize providers configured in LLM_PROVIDER_PRIORITY
  const priorityList = (process.env.LLM_PROVIDER_PRIORITY || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const seen = new Set<string>();
  for (const id of priorityList) {
    const caller = providerCallers[id];
    if (caller && !seen.has(id)) {
      seen.add(id);
      if (id === "google" || id === "google_ai_studio" || id === "gemini") {
        seen.add("google");
        seen.add("google_ai_studio");
        seen.add("gemini");
      }
      if (!attempts.includes(caller)) {
        attempts.push(caller);
      }
    }
  }

  // 3. Fall back to any remaining configured providers (default order: OpenAI, Groq, Google)
  const defaultOrder = ["openai", "groq", "google"];
  for (const id of defaultOrder) {
    const caller = providerCallers[id];
    if (caller && !attempts.includes(caller)) {
      attempts.push(caller);
    }
  }

  if (attempts.length === 0) {
    throw new Error(
      "Direct LLM backend has no usable API key (set OPENAI_API_KEY, GROQ_API_KEY, and/or GOOGLE_API_KEY)."
    );
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Direct LLM backend: all providers failed.");
}

export async function callOpenAI(messages: ChatMessage[], timeoutMs: number): Promise<DirectBackendResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key is missing (set OPENAI_API_KEY).");
  }
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const specifiedModel = process.env.OPENAI_MODEL;
  const models = specifiedModel ? [specifiedModel] : getRotatedModels(OPENAI_MODELS, openaiCallCount++);

  let lastError: unknown;
  for (const model of models) {
    try {
      const res = await fetchWithTimeout(
        `${baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages, temperature: 0 }),
        },
        timeoutMs
      );
      if (!res.ok) {
        throw new Error(`OpenAI direct call failed with model ${model}: ${res.status} ${await safeText(res)}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error(`OpenAI direct call: unexpected response shape from model ${model}.`);
      }
      return { content, servedBy: `direct:openai/${model}` };
    } catch (err) {
      lastError = err;
      if (models.length > 1) {
        console.warn(`[direct-llm:openai] model ${model} failed, trying rotated fallback model...`);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI direct call: all candidate models failed.");
}

export async function callGroq(messages: ChatMessage[], timeoutMs: number): Promise<DirectBackendResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Groq API key is missing (set GROQ_API_KEY).");
  }
  const specifiedModel = process.env.GROQ_MODEL;
  const models = specifiedModel ? [specifiedModel] : getRotatedModels(GROQ_MODELS, groqCallCount++);

  let lastError: unknown;
  for (const model of models) {
    try {
      const res = await fetchWithTimeout(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages, temperature: 0 }),
        },
        timeoutMs
      );
      if (!res.ok) {
        throw new Error(`Groq direct call failed with model ${model}: ${res.status} ${await safeText(res)}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error(`Groq direct call: unexpected response shape from model ${model}.`);
      }
      return { content, servedBy: `direct:groq/${model}` };
    } catch (err) {
      lastError = err;
      if (models.length > 1) {
        console.warn(`[direct-llm:groq] model ${model} failed, trying rotated fallback model...`);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Groq direct call: all candidate models failed.");
}

export async function callGemini(messages: ChatMessage[], timeoutMs: number): Promise<DirectBackendResult> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Google/Gemini API key is missing (set GOOGLE_API_KEY or GEMINI_API_KEY).");
  }
  const specifiedModel = process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL;
  const models = specifiedModel ? [specifiedModel] : getRotatedModels(GEMINI_MODELS, geminiCallCount++);

  const systemMessages = messages.filter((m) => m.role === "system");
  const conversation = messages.filter((m) => m.role !== "system");

  const contents = conversation.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0 },
  };
  if (systemMessages.length > 0) {
    body.systemInstruction = {
      parts: [{ text: systemMessages.map((m) => m.content).join("\n\n") }],
    };
  }

  let lastError: unknown;
  for (const model of models) {
    try {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
        },
        timeoutMs
      );
      if (!res.ok) {
        throw new Error(`Gemini direct call failed with model ${model}: ${res.status} ${await safeText(res)}`);
      }
      const data = await res.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof content !== "string") {
        throw new Error(`Gemini direct call: unexpected response shape from model ${model}.`);
      }
      return { content, servedBy: `direct:google_ai_studio/${model}` };
    } catch (err) {
      lastError = err;
      if (models.length > 1) {
        console.warn(`[direct-llm:gemini] model ${model} failed, trying rotated fallback model...`);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini direct call: all candidate models failed.");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    // Truncate to 150 chars max and mask any possible key leaks
    const truncated = raw.slice(0, 150).replace(/[a-zA-Z0-9_-]{20,}/g, "[REDACTED]");
    return truncated || "<empty body>";
  } catch {
    return "<no body>";
  }
}


