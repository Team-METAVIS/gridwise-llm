import { describe, expect, it } from "vitest";

import { parseProviderPriority, PriorityOrderStrategy } from "@/lib/llm/priorityStrategy";

function candidate(providerId: string, modelId = "m") {
  return {
    adapter: { config: { id: providerId } },
    model: { id: modelId },
  } as any;
}

describe("parseProviderPriority", () => {
  it("splits, trims, and drops empty entries", () => {
    expect(parseProviderPriority(" google_ai_studio, groq ,,cohere ")).toEqual([
      "google_ai_studio",
      "groq",
      "cohere",
    ]);
  });

  it("returns an empty list for undefined/empty input", () => {
    expect(parseProviderPriority(undefined)).toEqual([]);
    expect(parseProviderPriority("")).toEqual([]);
  });
});

describe("PriorityOrderStrategy", () => {
  it("orders candidates by the configured priority list", () => {
    const strategy = new PriorityOrderStrategy(["groq", "cohere"]);
    const candidates = [candidate("openrouter"), candidate("cohere"), candidate("groq"), candidate("google_ai_studio")];

    const ranked = strategy.rank(candidates, {} as any, {});

    expect(ranked.map((c) => c.adapter.config.id)).toEqual(["groq", "cohere", "openrouter", "google_ai_studio"]);
  });

  it("keeps unlisted providers in their original relative order, after listed ones", () => {
    const strategy = new PriorityOrderStrategy(["cohere"]);
    const candidates = [candidate("groq"), candidate("openrouter"), candidate("cohere")];

    const ranked = strategy.rank(candidates, {} as any, {});

    expect(ranked.map((c) => c.adapter.config.id)).toEqual(["cohere", "groq", "openrouter"]);
  });

  it("is a no-op ordering when the priority list is empty", () => {
    const strategy = new PriorityOrderStrategy([]);
    const candidates = [candidate("groq"), candidate("openrouter"), candidate("cohere")];

    const ranked = strategy.rank(candidates, {} as any, {});

    expect(ranked.map((c) => c.adapter.config.id)).toEqual(["groq", "openrouter", "cohere"]);
  });
});
