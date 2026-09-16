import { InvalidInputError, slugify } from "@sp/core";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { recordAudit } from "./audit";
import type { Database } from "./client";
import { isUniqueViolation } from "./errors";
import { accounts, agencies, agencyMembers, users } from "./schema";

export async function hasAnyAgency(db: Database): Promise<boolean> {
  const [row] = await db.select({ id: agencies.id }).from(agencies).limit(1);
  return Boolean(row);
}

export async function bootstrapAgency(
  db: Database,
  input: { agencyName: string; ownerName: string; email: string; passwordHash: string },
): Promise<{ agencyId: string; userId: string }> {
  try {
    return await db.transaction(async (tx) => {
      // Serialises simultaneous setup attempts so only the first one can create the agency.
      await tx.execute(sql`select pg_advisory_xact_lock(740211)`);
      if (await hasAnyAgency(tx)) throw new InvalidInputError("Setup has already been completed.");

      const [agency] = await tx
        .insert(agencies)
        .values({ name: input.agencyName.trim(), slug: slugify(input.agencyName, "agency") })
        .returning();
      if (!agency) throw new Error("Agency insert returned no row");

      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, name: input.ownerName.trim(), email: input.email, emailVerified: true });
      await tx.insert(accounts).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: input.passwordHash,
      });
      await tx.insert(agencyMembers).values({ agencyId: agency.id, userId, role: "super_admin" });
      await recordAudit(tx, {
        agencyId: agency.id,
        actorType: "user",
        actorId: userId,
        action: "agency.bootstrapped",
        objectType: "agency",
        objectId: agency.id,
        after: { name: agency.name },
      });

      return { agencyId: agency.id, userId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new InvalidInputError("An account with that email already exists.");
    throw error;
  }
}
