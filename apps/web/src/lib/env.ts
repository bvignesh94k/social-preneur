import "server-only";
import { z } from "zod";

const schema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters."),
  BETTER_AUTH_URL: z.url(),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// connection string."),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // Enables the one-time /setup page while no agency exists.
  SETUP_TOKEN: z.string().trim().min(24, "SETUP_TOKEN must be at least 24 characters.").optional(),
  AI_PROVIDER: z.enum(["claude", "gemini"]).default("claude"),
  ANTHROPIC_API_KEY: z.string().trim().optional(),
  CLAUDE_MODEL: z.string().trim().default("claude-opus-5"),
  CLAUDE_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z.string().trim().default("gemini-3.6-flash"),
  GEMINI_FALLBACK_MODELS: z
    .string()
    .default("gemini-3.5-flash")
    .transform((value) =>
      value
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  // Encrypts stored OAuth tokens at rest. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  TOKEN_ENCRYPTION_KEY: z.string().trim().optional(),
  LINKEDIN_CLIENT_ID: z.string().trim().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().trim().optional(),
});

export const env = schema.parse(process.env);
