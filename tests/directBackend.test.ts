import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callOpenAI,
  GEMINI_MODELS,
  getRotatedModels,
  GROQ_MODELS,
  interpretViaDirectFetch,
  OPENAI_MODELS,
  resetModelCallCounters,
} from "@/lib/llm/directBackend";
import type { ChatMessage } from "@/lib/llm/messages";

describe("directBackend model rotation", () => {
  beforeEach(() => {
    resetModelCallCounters();
  });

  it("rotates model pool predictably across call counts", () => {
    const pool = ["m1", "m2", "m3"];
    expect(getRotatedModels(pool, 0)).toEqual(["m1", "m2", "m3"]);
    expect(getRotatedModels(pool, 1)).toEqual(["m2", "m3", "m1"]);
    expect(getRotatedModels(pool, 2)).toEqual(["m3", "m1", "m2"]);
    expect(getRotatedModels(pool, 3)).toEqual(["m1", "m2", "m3"]);
  });

  it("exposes expected default model lists", () => {
    expect(GROQ_MODELS).toContain("openai/gpt-oss-120b");
    expect(GEMINI_MODELS).toContain("gemini-2.5-flash");
    expect(OPENAI_MODELS).toContain("gpt-4o-mini");
  });

});

describe("directBackend OpenAI & provider execution", () => {
  const originalEnv = { ...process.env };
  const sampleMessages: ChatMessage[] = [
    { role: "system", content: "You are a test helper." },
    { role: "user", content: "Hello" },
  ];

  beforeEach(() => {
    resetModelCallCounters();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws when no API keys are configured", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    await expect(interpretViaDirectFetch(sampleMessages, 1000)).rejects.toThrow(
      /Direct LLM backend has no usable API key/
    );
  });

  it("calls OpenAI endpoint successfully when OPENAI_API_KEY is present", async () => {
    process.env.OPENAI_API_KEY = "test-sk-key";
    process.env.OPENAI_MODEL = "custom-test-model";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[{"directive_type": "no_op"}]' } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await callOpenAI(sampleMessages, 2000);
    expect(res.content).toBe('[{"directive_type": "no_op"}]');
    expect(res.servedBy).toBe("direct:openai/custom-test-model");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-sk-key",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("rotates and falls back to subsequent model if primary model fails", async () => {
    process.env.OPENAI_API_KEY = "test-sk-key";
    delete process.env.OPENAI_MODEL; // let rotation occur

    let callNum = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url, options) => {
      callNum++;
      const body = JSON.parse(options.body);
      if (body.model === OPENAI_MODELS[0]) {
        // First model returns 429 rate limit
        return {
          ok: false,
          status: 429,
          text: async () => "Rate limit reached",
        };
      }
      // Second model succeeds
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '[{"directive_type": "no_op"}]' } }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await callOpenAI(sampleMessages, 2000);
    expect(res.content).toBe('[{"directive_type": "no_op"}]');
    expect(res.servedBy).toBe(`direct:openai/${OPENAI_MODELS[1]}`);
    expect(callNum).toBe(2);
  });

  it("respects LLM_BACKEND=openai to prioritize OpenAI directly", async () => {
    process.env.LLM_BACKEND = "openai";
    process.env.OPENAI_API_KEY = "test-sk-key";
    process.env.GROQ_API_KEY = "test-groq-key";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "[]" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await interpretViaDirectFetch(sampleMessages, 2000);
    expect(res.servedBy).toContain("direct:openai/");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("openai.com"),
      expect.anything()
    );
  });
});
