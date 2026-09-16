import type { z } from "zod";

export interface GenerateObjectRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

export interface GenerateObjectResult<T> {
  data: T;
  provider: string;
  model: string;
  usage: AiUsage;
  latencyMs: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generateObject<T>(request: GenerateObjectRequest<T>): Promise<GenerateObjectResult<T>>;
}
