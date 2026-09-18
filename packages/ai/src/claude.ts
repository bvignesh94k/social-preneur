import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { applyHouseStyle } from "@sp/core";
import { AiError } from "./errors";
import type { AiProvider, GenerateObjectRequest, GenerateObjectResult } from "./provider";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5";

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeOptions {
  apiKey: string | undefined;
  model?: string;
  effort?: ClaudeEffort;
  // Tests pass a client built with their own fetch; production builds one from the key.
  client?: Anthropic;
  timeoutMs?: number;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;

  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    // Connection and timeout failures arrive as APIError with no status.
    if (status === undefined) return new AiError("unavailable", error.message);
    if (status === 401 || status === 403) return new AiError("auth", status === 401 ? "invalid key" : error.message);
    if (status === 429) return new AiError("quota", error.message);
    if (status >= 500) return new AiError("unavailable", error.message);
    return new AiError("bad_response", error.message);
  }

  return new AiError("unavailable", error instanceof Error ? error.message : String(error));
}

export function createClaudeProvider(options: ClaudeOptions): AiProvider {
  const model = options.model?.trim() || DEFAULT_CLAUDE_MODEL;
  const retryDelays = options.retryDelaysMs ?? [2_000, 6_000];
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let client = options.client;
  function getClient(): Anthropic {
    client ??= new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 180_000,
      // Retries are handled below so every attempt is counted and delayed the same way.
      maxRetries: 0,
    });
    return client;
  }

  async function callOnce<T>(request: GenerateObjectRequest<T>): Promise<GenerateObjectResult<T>> {
    const started = Date.now();

    let response;
    try {
      response = await getClient().messages.parse({
        model,
        max_tokens: request.maxOutputTokens ?? 16_000,
        // The system block carries the stable brand context, so caching it makes repeat
        // calls for the same client read the prefix at a fraction of the input price.
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: request.prompt }],
        output_config: {
          format: zodOutputFormat(request.schema),
          ...(options.effort ? { effort: options.effort } : {}),
        },
        // request.temperature is deliberately ignored: sampling parameters are rejected
        // by this model family, and effort is the equivalent control.
      });
    } catch (error) {
      throw toAiError(error);
    }

    if (response.stop_reason === "refusal") {
      throw new AiError("blocked", response.stop_details?.explanation ?? "declined");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiError("bad_response", "The answer was cut off");
    }

    const result = request.schema.safeParse(response.parsed_output);
    if (!result.success) throw new AiError("bad_response", result.error.message);

    const usage = response.usage;
    return {
      data: applyHouseStyle(result.data),
      provider: "claude",
      model: response.model ?? model,
      usage: {
        // Cached reads are billed differently but are still input the model saw.
        inputTokens: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.output_tokens,
        thinkingTokens: usage.output_tokens_details?.thinking_tokens ?? 0,
      },
      latencyMs: Date.now() - started,
    };
  }

  return {
    name: "claude",
    model,

    async generateObject<T>(request: GenerateObjectRequest<T>): Promise<GenerateObjectResult<T>> {
      if (!options.apiKey && !options.client) throw new AiError("not_configured");

      let lastError: AiError | undefined;
      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        try {
          return await callOnce(request);
        } catch (error) {
          const aiError = toAiError(error);
          // Only overload and network failures are worth retrying; the rest fail the same way again.
          if (aiError.code !== "unavailable") throw aiError;
          lastError = aiError;
          const delay = retryDelays[attempt];
          if (delay !== undefined) await sleep(delay);
        }
      }
      throw lastError ?? new AiError("unavailable");
    },
  };
}
