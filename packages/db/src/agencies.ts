import type { AgencyRole } from "@sp/core";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "./client";
import { agencies, agencyMembers } from "./schema";

export type Agency = typeof agencies.$inferSelect;

export async function findAgencyBySlug(db: Database, slug: string): Promise<Agency | null> {
  const [agency] = await db.select().from(agencies).where(eq(agencies.slug, slug)).limit(1);
  return agency ?? null;
}

export interface ActiveMembership {
  role: AgencyRole;
  agency: { id: string; name: string; slug: string; timezone: string };
}

// Oldest active membership wins until users can switch between agencies.
export async function findActiveMembership(db: Database, userId: string): Promise<ActiveMembership | null> {
  const [membership] = await db
    .select({
      role: agencyMembers.role,
      agency: { id: agencies.id, name: agencies.name, slug: agencies.slug, timezone: agencies.timezone },
    })
    .from(agencyMembers)
    .innerJoin(agencies, eq(agencies.id, agencyMembers.agencyId))
    .where(and(eq(agencyMembers.userId, userId), eq(agencyMembers.status, "active")))
    .orderBy(asc(agencyMembers.createdAt))
    .limit(1);
  return membership ?? null;
}
