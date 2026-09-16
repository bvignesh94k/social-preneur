import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createClaudeProvider } from "./claude";
import { AiError } from "./errors";

const schema = z.object({ headline: z.string() });
const request = { system: "You write captions.", prompt: "One headline.", schema };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function okBody(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content: [{ type: "text", text: JSON.stringify(data) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 400,
      cache_creation_input_tokens: null,
      output_tokens_details: { thinking_tokens: 8 },
    },
    ...extra,
  };
}

function providerWith(responses: Response[], sleeps: number[] = []) {
  let call = 0;
  const bodies: string[] = [];
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_input, init) => {
      bodies.push(String(init?.body ?? ""));
      const response = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      return response;
    },
  });

  const provider = createClaudeProvider({
    apiKey: "test-key",
    client,
    retryDelaysMs: [1, 2],
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  return { provider, bodies, calls: () => call };
}

describe("claude provider", () => {
  it("returns parsed data with usage and the cached input counted", async () => {
    const { provider, bodies } = providerWith([jsonResponse(okBody({ headline: "Labels that last" }))]);

    const result = await provider.generateObject(request);

    expect(result.data).toEqual({ headline: "Labels that last" });
    expect(result.provider).toBe("claude");
    expect(result.model).toBe("claude-opus-5");
    expect(result.usage).toEqual({ inputTokens: 500, outputTokens: 20, thinkingTokens: 8 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    const sent = JSON.parse(bodies[0]!);
    expect(sent.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(sent.output_config.format).toBeDefined();
    expect(sent.temperature).toBeUndefined();
  });

  it("reports a missing key without calling the API", async () => {
    const provider = createClaudeProvider({ apiKey: undefined });
    await expect(provider.generateObject(request)).rejects.toMatchObject({ code: "not_configured" });
  });

  it("maps a rejected key to an auth error", async () => {
    const { provider } = providerWith([jsonResponse({ error: { message: "invalid x-api-key" } }, 401)]);
    await expect(provider.generateObject(request)).rejects.toMatchObject({ code: "auth" });
  });

  it("maps rate limiting to a quota error", async () => {
    const { provider } = providerWith([jsonResponse({ error: { message: "slow down" } }, 429)]);
    await expect(provider.generateObject(request)).rejects.toMatchObject({ code: "quota" });
  });

  it("treats a refusal as blocked rather than a broken answer", async () => {
    const body = okBody({ headline: "x" }, {
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "other", explanation: "declined" },
    });
    const { provider } = providerWith([jsonResponse(body)]);
    await expect(provider.generateObject(request)).rejects.toMatchObject({ code: "blocked" });
  });

  it("treats a cut off answer as a bad response", async () => {
    const { provider } = providerWith([jsonResponse(okBody({ headline: "x" }, { stop_reason: "max_tokens" }))]);
    await expect(provider.generateObject(request)).rejects.toMatchObject({ code: "bad_response" });
  });

  it("retries an overloaded provider and succeeds", async () => {
    const sleeps: number[] = [];
    const { provider, calls } = providerWith(
      [
        jsonResponse({ error: { message: "overloaded" } }, 529),
        jsonResponse({ error: { message: "overloaded" } }, 500),
        jsonResponse(okBody({ headline: "Second try" })),
      ],
      sleeps,
    );

    const result = await provider.generateObject(request);

    expect(result.data).toEqual({ headline: "Second try" });
    expect(calls()).toBe(3);
    expect(sleeps).toEqual([1, 2]);
  });

  it("gives up after the retries are spent", async () => {
    const { provider, calls } = providerWith([jsonResponse({ error: { message: "down" } }, 503)]);
    await expect(provider.generateObject(request)).rejects.toMatchObject({ code: "unavailable" });
    expect(calls()).toBe(3);
  });

  it("rejects an answer that does not match the schema", async () => {
    const { provider } = providerWith([jsonResponse(okBody({ headline: 42 }))]);
    await expect(provider.generateObject(request)).rejects.toBeInstanceOf(AiError);
  });
});
