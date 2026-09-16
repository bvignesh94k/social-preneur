import { index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id } from "./columns";
import { agencies } from "./tenancy";

export const aiRunStatus = pgEnum("ai_run_status", ["ok", "error"]);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: id(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    userId: text("user_id").references(() => users.id),
    feature: text("feature").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    thinkingTokens: integer("thinking_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    status: aiRunStatus("status").notNull(),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_runs_agency_created_idx").on(t.agencyId, t.createdAt.desc()),
    index("ai_runs_client_created_idx").on(t.clientId, t.createdAt.desc()),
  ],
);
