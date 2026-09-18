import type { ChatMessage } from "./messages";

export interface DirectBackendResult {
  content: string;
  servedBy: string;
}

/**
 * Zero-dependency, plain-`fetch` LLM backend. This is the safety net used
 * when @free-ai-gateway/core cannot be constructed (e.g. its on-disk provider
 * catalog isn't reachable in a given deployment) or when LLM_BACKEND=direct
 * is set explicitly. It intentionally supports only the two simplest free
 * providers, tried in order, so it has no dependency surface of its own.
 */
export async function interpretViaDirectFetch(
  messages: ChatMessage[],
  timeoutMs: number
): Promise<DirectBackendResult> {
  const attempts: Array<() => Promise<DirectBackendResult>> = [];

  if (process.env.GROQ_API_KEY) {
    attempts.push(() => callGroq(messages, timeoutMs));
  }
  if (process.env.GOOGLE_API_KEY) {
    attempts.push(() => callGemini(messages, timeoutMs));
  }

  if (attempts.length === 0) {
    throw new Error("Direct LLM backend has no usable API key (set GROQ_API_KEY and/or GOOGLE_API_KEY).");
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

async function callGroq(messages: ChatMessage[], timeoutMs: number): Promise<DirectBackendResult> {
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0 }),
    },
    timeoutMs
  );
  if (!res.ok) {
    throw new Error(`Groq direct call failed: ${res.status} ${await safeText(res)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Groq direct call: unexpected response shape.");
  }
  return { content, servedBy: `direct:groq/${model}` };
}

async function callGemini(messages: ChatMessage[], timeoutMs: number): Promise<DirectBackendResult> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
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

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  if (!res.ok) {
    throw new Error(`Gemini direct call failed: ${res.status} ${await safeText(res)}`);
  }
  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== "string") {
    throw new Error("Gemini direct call: unexpected response shape.");
  }
  return { content, servedBy: `direct:google_ai_studio/${model}` };
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
    return await res.text();
  } catch {
    return "<no body>";
  }
}
