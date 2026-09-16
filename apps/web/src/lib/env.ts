import "server-only";
import { z } from "zod";

const schema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters."),
  BETTER_AUTH_URL: z.url(),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// connection string."),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // Enables the one-time /setup page while no agency exists.
  SETUP_TOKEN: z.string().trim().min(24, "SETUP_TOKEN must be at least 24 characters.").optional(),
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
});

export const env = schema.parse(process.env);
