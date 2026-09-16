import { applyHouseStyle } from "@sp/core";
import { z } from "zod";
import { AiError } from "./errors";
import type { AiProvider, GenerateObjectRequest, GenerateObjectResult } from "./provider";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  error?: { message?: string };
}

export interface GeminiOptions {
  apiKey: string | undefined;
  model: string;
  // Tried in order when the main model stays overloaded.
  fallbackModels?: string[];
  fetch?: FetchLike;
  timeoutMs?: number;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = { ...z.toJSONSchema(schema) } as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export function createGeminiProvider(options: GeminiOptions): AiProvider {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const retryDelays = options.retryDelaysMs ?? [2_000, 6_000];
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function callOnce<T>(model: string, request: GenerateObjectRequest<T>): Promise<GenerateObjectResult<T>> {
    const started = Date.now();

    let response: Response;
    try {
      response = await doFetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey ?? "" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: toGeminiSchema(request.schema),
            temperature: request.temperature ?? 0.3,
            // Gemini counts hidden reasoning against this limit, so it needs headroom.
            maxOutputTokens: request.maxOutputTokens ?? 16_000,
          },
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
      });
    } catch (error) {
      throw new AiError("unavailable", error instanceof Error ? error.message : String(error));
    }

    const body = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok) {
      const detail = body.error?.message ?? `HTTP ${response.status}`;
      if (response.status === 401 || response.status === 403) throw new AiError("auth", detail);
      if (response.status === 400 && /api key/i.test(detail)) throw new AiError("auth", detail);
      if (response.status === 429) throw new AiError("quota", detail);
      if (response.status >= 500) throw new AiError("unavailable", detail);
      throw new AiError("bad_response", detail);
    }

    if (body.promptFeedback?.blockReason) throw new AiError("blocked", body.promptFeedback.blockReason);
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
      throw new AiError("blocked", candidate.finishReason);
    }
    if (candidate?.finishReason === "MAX_TOKENS") throw new AiError("bad_response", "The answer was cut off");

    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiError("bad_response", "The answer was not valid JSON");
    }
    const result = request.schema.safeParse(parsed);
    if (!result.success) throw new AiError("bad_response", result.error.message);

    return {
      data: applyHouseStyle(result.data),
      provider: "gemini",
      model,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
        thinkingTokens: body.usageMetadata?.thoughtsTokenCount ?? 0,
      },
      latencyMs: Date.now() - started,
    };
  }

  return {
    name: "gemini",
    model: options.model,

    async generateObject<T>(request: GenerateObjectRequest<T>): Promise<GenerateObjectResult<T>> {
      if (!options.apiKey) throw new AiError("not_configured");

      let lastError: AiError | undefined;
      for (const model of [options.model, ...(options.fallbackModels ?? [])]) {
        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
          try {
            return await callOnce(model, request);
          } catch (error) {
            // Only overload and network failures are worth retrying; other errors would fail the same way again.
            if (!(error instanceof AiError) || error.code !== "unavailable") throw error;
            lastError = error;
            const delay = retryDelays[attempt];
            if (delay !== undefined) await sleep(delay);
          }
        }
      }
      throw lastError ?? new AiError("unavailable");
    },
  };
}
