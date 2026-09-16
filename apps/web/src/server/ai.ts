import "server-only";
import {
  AiError,
  createClaudeProvider,
  createGeminiProvider,
  type AiProvider,
  type GenerateObjectRequest,
  type GenerateObjectResult,
} from "@sp/ai";
import { recordAiRun } from "@sp/db";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";

let provider: AiProvider | undefined;

export function getAiProvider(): AiProvider {
  provider ??=
    env.AI_PROVIDER === "gemini"
      ? createGeminiProvider({
          apiKey: env.GEMINI_API_KEY,
          model: env.GEMINI_MODEL,
          fallbackModels: env.GEMINI_FALLBACK_MODELS,
        })
      : createClaudeProvider({
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.CLAUDE_MODEL,
          effort: env.CLAUDE_EFFORT,
        });
  return provider;
}

export interface AiRunContext {
  feature: string;
  agencyId: string;
  clientId: string | null;
  userId: string | null;
}

// Every AI call is recorded, successful or not, so usage and failures can be reviewed per client.
export async function generateWithLogging<T>(
  context: AiRunContext,
  request: GenerateObjectRequest<T>,
): Promise<GenerateObjectResult<T>> {
  const ai = getAiProvider();
  const db = await getDb();
  const started = Date.now();

  try {
    const result = await ai.generateObject(request);
    await recordAiRun(db, {
      ...context,
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      thinkingTokens: result.usage.thinkingTokens,
      latencyMs: result.latencyMs,
      status: "ok",
    });
    return result;
  } catch (error) {
    await recordAiRun(db, {
      ...context,
      provider: ai.name,
      model: ai.model,
      latencyMs: Date.now() - started,
      status: "error",
      errorCode: error instanceof AiError ? error.code : "unexpected",
    }).catch(() => {});
    throw error;
  }
}
