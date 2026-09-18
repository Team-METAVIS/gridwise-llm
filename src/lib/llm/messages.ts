import { FEW_SHOT_EXAMPLES, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** OpenAI-style message list shared by every LLM backend (gateway + direct-fetch). */
export function buildChatMessages(operatorNotes: string[]): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const example of FEW_SHOT_EXAMPLES) {
    messages.push({ role: "user", content: buildUserPrompt(example.notes) });
    messages.push({ role: "assistant", content: example.response });
  }
  messages.push({ role: "user", content: buildUserPrompt(operatorNotes) });
  return messages;
}

/** Extracts a JSON array substring from a model response that may be wrapped in
 * prose or markdown code fences, despite the prompt asking for raw JSON. */
export function extractJsonArray(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    return candidate.trim();
  }
  return candidate.slice(start, end + 1).trim();
}
