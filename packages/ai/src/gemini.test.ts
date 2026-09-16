import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiError } from "./errors";
import { createGeminiProvider, type FetchLike } from "./gemini";

const schema = z.object({ summary: z.string(), note: z.string().nullable() });
const noWait = { retryDelaysMs: [] as number[] };

function sequence(responses: [number, unknown][]): { fetch: FetchLike; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const [status, body] = responses[Math.min(index++, responses.length - 1)]!;
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    },
  };
}

const ok = (text: string) => ({
  candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 200 },
});

const busy = { error: { message: "This model is currently experiencing high demand." } };
const answer = JSON.stringify({ summary: "Labels", note: null });

describe("createGeminiProvider", () => {
  it("sends the schema and key, ignores thought parts and cleans dashes from the answer", async () => {
    const mock = sequence([[200, ok(JSON.stringify({ summary: "Labels — made in Coimbatore", note: null }))]]);
    const provider = createGeminiProvider({ apiKey: "test-key", model: "gemini-test", fetch: mock.fetch });

    const result = await provider.generateObject({ system: "Be factual.", prompt: "Summarise.", schema });

    expect(result.data).toEqual({ summary: "Labels, made in Coimbatore", note: null });
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 30, thinkingTokens: 200 });

    const call = mock.calls[0]!;
    expect(call.url).toContain("/models/gemini-test:generateContent");
    expect((call.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const sent = JSON.parse(String(call.init.body));
    expect(sent.systemInstruction.parts[0].text).toBe("Be factual.");
    expect(sent.generationConfig.responseMimeType).toBe("application/json");
    expect(sent.generationConfig.responseJsonSchema.$schema).toBeUndefined();
    expect(sent.generationConfig.responseJsonSchema.properties.summary).toBeDefined();
  });

  it("refuses to run without a key", async () => {
    const provider = createGeminiProvider({ apiKey: undefined, model: "m", fetch: sequence([[200, ok("{}")]]).fetch });
    await expect(provider.generateObject({ system: "", prompt: "", schema })).rejects.toMatchObject({
      code: "not_configured",
    });
  });

  it.each([
    [429, { error: { message: "Quota exceeded" } }, "quota"],
    [403, { error: { message: "Permission denied" } }, "auth"],
    [400, { error: { message: "API key not valid" } }, "auth"],
    [503, busy, "unavailable"],
  ])("maps HTTP %i to %s errors", async (status, body, code) => {
    const provider = createGeminiProvider({ apiKey: "k", model: "m", fetch: sequence([[status, body]]).fetch, ...noWait });
    await expect(provider.generateObject({ system: "", prompt: "", schema })).rejects.toMatchObject({ code });
  });

  it("retries a busy model and succeeds on a later attempt", async () => {
    const waits: number[] = [];
    const mock = sequence([
      [503, busy],
      [200, ok(answer)],
    ]);
    const provider = createGeminiProvider({
      apiKey: "k",
      model: "main",
      fetch: mock.fetch,
      retryDelaysMs: [10, 20],
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    const result = await provider.generateObject({ system: "", prompt: "", schema });
    expect(result.model).toBe("main");
    expect(waits).toEqual([10]);
    expect(mock.calls).toHaveLength(2);
  });

  it("falls back to the next model when the main one stays busy", async () => {
    const mock = sequence([
      [503, busy],
      [503, busy],
      [200, ok(answer)],
    ]);
    const provider = createGeminiProvider({
      apiKey: "k",
      model: "main",
      fallbackModels: ["backup"],
      fetch: mock.fetch,
      retryDelaysMs: [1],
      sleep: async () => {},
    });

    const result = await provider.generateObject({ system: "", prompt: "", schema });
    expect(result.model).toBe("backup");
    expect(mock.calls.map((c) => c.url.includes("/models/backup:"))).toEqual([false, false, true]);
  });

  it("does not retry errors that would fail the same way again", async () => {
    const mock = sequence([[429, { error: { message: "Quota exceeded" } }]]);
    const provider = createGeminiProvider({
      apiKey: "k",
      model: "main",
      fallbackModels: ["backup"],
      fetch: mock.fetch,
      retryDelaysMs: [1, 1],
      sleep: async () => {},
    });
    await expect(provider.generateObject({ system: "", prompt: "", schema })).rejects.toMatchObject({ code: "quota" });
    expect(mock.calls).toHaveLength(1);
  });

  it("rejects answers that are not JSON or do not match the schema", async () => {
    const notJson = createGeminiProvider({ apiKey: "k", model: "m", fetch: sequence([[200, ok("not json")]]).fetch });
    await expect(notJson.generateObject({ system: "", prompt: "", schema })).rejects.toMatchObject({
      code: "bad_response",
    });

    const wrongShape = createGeminiProvider({
      apiKey: "k",
      model: "m",
      fetch: sequence([[200, ok(JSON.stringify({ summary: 5 }))]]).fetch,
    });
    await expect(wrongShape.generateObject({ system: "", prompt: "", schema })).rejects.toBeInstanceOf(AiError);
  });

  it("reports blocked and cut-off answers", async () => {
    const blocked = createGeminiProvider({
      apiKey: "k",
      model: "m",
      fetch: sequence([[200, { promptFeedback: { blockReason: "SAFETY" } }]]).fetch,
    });
    await expect(blocked.generateObject({ system: "", prompt: "", schema })).rejects.toMatchObject({ code: "blocked" });

    const cut = createGeminiProvider({
      apiKey: "k",
      model: "m",
      fetch: sequence([[200, { candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }] }]]).fetch,
    });
    await expect(cut.generateObject({ system: "", prompt: "", schema })).rejects.toMatchObject({ code: "bad_response" });
  });
});
