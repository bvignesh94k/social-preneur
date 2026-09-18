import {
  InvalidInputError,
  NotFoundError,
  type Actor,
  type FactKind,
  type SocialLinks,
  type SocialPlatform,
} from "@sp/core";
import { and, asc, desc, eq, inArray, ne, or, isNull } from "drizzle-orm";
import { isUuid, requireClientAccess, type ClientScope } from "./access";
import { recordAudit } from "./audit";
import {
  createFact,
  createOffering,
  getBrandProfile,
  updateBrandProfileFields,
  type BrandProfile,
  type BrandProfileInput,
} from "./brand";
import type { Database } from "./client";
import { isUniqueViolation } from "./errors";
import {
  aiRuns,
  brandFacts,
  brandProfiles,
  brandSuggestions,
  clients,
  offerings,
  websitePages,
  websiteScans,
} from "./schema";

export type WebsiteScan = typeof websiteScans.$inferSelect;
export type WebsitePage = typeof websitePages.$inferSelect;
export type BrandSuggestion = typeof brandSuggestions.$inferSelect;
export type AiRunEntry = typeof aiRuns.$inferInsert;

export const SUGGESTIBLE_PROFILE_FIELDS = [
  "description",
  "targetAudience",
  "targetLocations",
  "usps",
  "primaryCta",
  "phone",
  "email",
  "socialLinks",
] as const satisfies readonly (keyof BrandProfileInput)[];
export type SuggestibleProfileField = (typeof SUGGESTIBLE_PROFILE_FIELDS)[number];

export type NewSuggestion =
  | { kind: "profile_field"; field: SuggestibleProfileField; value: string | string[] | SocialLinks; sourceUrl: string | null }
  | {
      kind: "offering";
      value: { kind: "product" | "service"; name: string; summary: string | null; benefits: string[] };
      sourceUrl: string;
    }
  | { kind: "fact"; value: { kind: FactKind; statement: string }; sourceUrl: string };

export async function recordAiRun(db: Database, entry: AiRunEntry): Promise<void> {
  await db.insert(aiRuns).values(entry);
}

export async function startWebsiteScan(db: Database, actor: Actor, clientId: string, url: string): Promise<WebsiteScan> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  try {
    return await db.transaction(async (tx) => {
      const [scan] = await tx
        .insert(websiteScans)
        .values({ agencyId: scope.agencyId, clientId: scope.clientId, url, startedBy: actor.userId })
        .returning();
      if (!scan) throw new Error("Scan insert returned no row");
      await recordAudit(tx, {
        agencyId: scope.agencyId,
        clientId: scope.clientId,
        actorType: "user",
        actorId: actor.userId,
        action: "brand.website_scan_started",
        objectType: "website_scan",
        objectId: scan.id,
        after: { url },
      });
      return scan;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new InvalidInputError("A website scan is already running for this client.");
    throw error;
  }
}

export async function getLatestWebsiteScan(db: Database, scope: ClientScope): Promise<WebsiteScan | null> {
  const [scan] = await db
    .select()
    .from(websiteScans)
    .where(and(eq(websiteScans.clientId, scope.clientId), eq(websiteScans.agencyId, scope.agencyId)))
    .orderBy(desc(websiteScans.createdAt))
    .limit(1);
  return scan ?? null;
}

export async function listScanPages(db: Database, scope: ClientScope, scanId: string): Promise<WebsitePage[]> {
  if (!isUuid(scanId)) return [];
  return db
    .select()
    .from(websitePages)
    .where(and(eq(websitePages.scanId, scanId), eq(websitePages.clientId, scope.clientId)))
    .orderBy(asc(websitePages.createdAt));
}

export async function listPendingSuggestions(db: Database, scope: ClientScope): Promise<BrandSuggestion[]> {
  return db
    .select()
    .from(brandSuggestions)
    .where(
      and(
        eq(brandSuggestions.clientId, scope.clientId),
        eq(brandSuggestions.agencyId, scope.agencyId),
        eq(brandSuggestions.status, "pending"),
      ),
    )
    .orderBy(asc(brandSuggestions.createdAt));
}

// Background job steps. The scan id always comes from startWebsiteScan, which already checked permissions.

export async function claimWebsiteScan(db: Database, scanId: string): Promise<WebsiteScan | null> {
  if (!isUuid(scanId)) return null;
  const [scan] = await db
    .update(websiteScans)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(websiteScans.id, scanId), eq(websiteScans.status, "queued")))
    .returning();
  return scan ?? null;
}

export async function completeWebsiteScan(
  db: Database,
  scan: WebsiteScan,
  result: {
    pages: { url: string; title: string | null; category: string; summary: string | null }[];
    pagesSkipped: number;
    suggestions: NewSuggestion[];
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    if (result.pages.length > 0) {
      await tx.insert(websitePages).values(
        result.pages.map((page) => ({ ...page, agencyId: scan.agencyId, clientId: scan.clientId, scanId: scan.id })),
      );
    }

    // A new scan replaces suggestions nobody has reviewed yet.
    await tx
      .update(brandSuggestions)
      .set({ status: "dismissed", reviewedAt: new Date() })
      .where(
        and(
          eq(brandSuggestions.clientId, scan.clientId),
          eq(brandSuggestions.status, "pending"),
          or(ne(brandSuggestions.scanId, scan.id), isNull(brandSuggestions.scanId)),
        ),
      );

    if (result.suggestions.length > 0) {
      await tx.insert(brandSuggestions).values(
        result.suggestions.map((suggestion) => ({
          agencyId: scan.agencyId,
          clientId: scan.clientId,
          scanId: scan.id,
          kind: suggestion.kind,
          field: suggestion.kind === "profile_field" ? suggestion.field : null,
          payload: { value: suggestion.value },
          sourceUrl: suggestion.sourceUrl,
        })),
      );
    }

    await tx
      .update(websiteScans)
      .set({
        status: "done",
        pagesRead: result.pages.length,
        pagesSkipped: result.pagesSkipped,
        finishedAt: new Date(),
      })
      .where(eq(websiteScans.id, scan.id));
  });
}

export interface ScanJobContext {
  clientName: string;
  profile: BrandProfile | null;
  offeringNames: string[];
  factStatements: string[];
}

export async function getScanJobContext(db: Database, scan: WebsiteScan): Promise<ScanJobContext> {
  const [client] = await db
    .select({ name: clients.name })
    .from(clients)
    .where(and(eq(clients.id, scan.clientId), eq(clients.agencyId, scan.agencyId)))
    .limit(1);
  if (!client) throw new NotFoundError("Client");

  const [[profile], offeringRows, factRows] = await Promise.all([
    db.select().from(brandProfiles).where(eq(brandProfiles.clientId, scan.clientId)).limit(1),
    db.select({ name: offerings.name }).from(offerings).where(eq(offerings.clientId, scan.clientId)),
    db.select({ statement: brandFacts.statement }).from(brandFacts).where(eq(brandFacts.clientId, scan.clientId)),
  ]);

  return {
    clientName: client.name,
    profile: profile ?? null,
    offeringNames: offeringRows.map((row) => row.name),
    factStatements: factRows.map((row) => row.statement),
  };
}

export interface AnalysisForSuggestions {
  profile: {
    description: string | null;
    targetAudience: string | null;
    targetLocations: string[];
    usps: string[];
    primaryCta: string | null;
    phone: string | null;
    email: string | null;
    socialLinks: { platform: SocialPlatform; url: string }[];
  };
  offerings: { kind: "product" | "service"; name: string; summary: string | null; benefits: string[]; sourceUrl: string }[];
  facts: { kind: FactKind; statement: string; sourceUrl: string }[];
}

const sameText = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

// Only suggests what would actually change the Brand Brain.
export function suggestionsFromAnalysis(
  analysis: AnalysisForSuggestions,
  context: { profile: BrandProfile | null; factStatements: string[] },
): NewSuggestion[] {
  const { profile } = context;
  const suggestions: NewSuggestion[] = [];

  for (const field of ["description", "targetAudience", "primaryCta", "phone", "email"] as const) {
    const value = analysis.profile[field];
    if (value && !sameText(profile?.[field], value)) {
      suggestions.push({ kind: "profile_field", field, value, sourceUrl: null });
    }
  }

  for (const field of ["targetLocations", "usps"] as const) {
    const existing = new Set((profile?.[field] ?? []).map((item) => item.toLowerCase()));
    const fresh = analysis.profile[field].filter((item) => !existing.has(item.toLowerCase()));
    if (fresh.length > 0) suggestions.push({ kind: "profile_field", field, value: fresh, sourceUrl: null });
  }

  const links: SocialLinks = {};
  for (const link of analysis.profile.socialLinks) {
    if (!profile?.socialLinks?.[link.platform]) links[link.platform] = link.url;
  }
  if (Object.keys(links).length > 0) {
    suggestions.push({ kind: "profile_field", field: "socialLinks", value: links, sourceUrl: null });
  }

  for (const offering of analysis.offerings) {
    suggestions.push({
      kind: "offering",
      value: { kind: offering.kind, name: offering.name, summary: offering.summary, benefits: offering.benefits },
      sourceUrl: offering.sourceUrl,
    });
  }

  const knownFacts = new Set(context.factStatements.map((statement) => statement.toLowerCase()));
  for (const fact of analysis.facts) {
    if (knownFacts.has(fact.statement.toLowerCase())) continue;
    suggestions.push({ kind: "fact", value: { kind: fact.kind, statement: fact.statement }, sourceUrl: fact.sourceUrl });
  }

  return suggestions;
}

export async function failWebsiteScan(db: Database, scanId: string, message: string): Promise<void> {
  await db
    .update(websiteScans)
    .set({ status: "failed", errorMessage: message.slice(0, 500), finishedAt: new Date() })
    .where(and(eq(websiteScans.id, scanId), inArray(websiteScans.status, ["queued", "running"])));
}

async function findPendingSuggestion(db: Database, scope: ClientScope, suggestionId: string): Promise<BrandSuggestion> {
  if (!isUuid(suggestionId)) throw new NotFoundError("Suggestion");
  const [row] = await db
    .select()
    .from(brandSuggestions)
    .where(
      and(
        eq(brandSuggestions.id, suggestionId),
        eq(brandSuggestions.clientId, scope.clientId),
        eq(brandSuggestions.status, "pending"),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Suggestion");
  return row;
}

function mergeList(current: string[], incoming: string[]): string[] {
  const seen = new Set(current.map((item) => item.toLowerCase()));
  return [...current, ...incoming.filter((item) => !seen.has(item.toLowerCase()))];
}

export async function acceptSuggestion(db: Database, actor: Actor, clientId: string, suggestionId: string): Promise<void> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);

  await db.transaction(async (tx) => {
    const suggestion = await findPendingSuggestion(tx, scope, suggestionId);
    const value = (suggestion.payload as { value?: unknown }).value;

    if (suggestion.kind === "profile_field") {
      const field = suggestion.field as SuggestibleProfileField;
      if (!SUGGESTIBLE_PROFILE_FIELDS.includes(field)) throw new InvalidInputError("This suggestion can't be applied.");
      const current = await getBrandProfile(tx, scope);
      let patch: Partial<BrandProfileInput>;
      if (field === "targetLocations" || field === "usps") {
        patch = { [field]: mergeList(current?.[field] ?? [], (value as string[]) ?? []) };
      } else if (field === "socialLinks") {
        patch = { socialLinks: { ...(current?.socialLinks ?? {}), ...(value as SocialLinks) } };
      } else {
        patch = { [field]: typeof value === "string" ? value : null };
      }
      await updateBrandProfileFields(tx, actor, clientId, patch);
    } else if (suggestion.kind === "offering") {
      const offering = value as { kind: "product" | "service"; name: string; summary: string | null; benefits: string[] };
      await createOffering(tx, actor, clientId, { ...offering, audience: null, url: suggestion.sourceUrl });
    } else {
      const fact = value as { kind: FactKind; statement: string };
      await createFact(
        tx,
        actor,
        clientId,
        { kind: fact.kind, statement: fact.statement, sourceRef: suggestion.sourceUrl, offeringId: null },
        { sourceType: "website" },
      );
    }

    await tx
      .update(brandSuggestions)
      .set({ status: "accepted", reviewedBy: actor.userId, reviewedAt: new Date() })
      .where(eq(brandSuggestions.id, suggestion.id));
    await recordAudit(tx, {
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      actorType: "user",
      actorId: actor.userId,
      action: "brand.suggestion_accepted",
      objectType: "brand_suggestion",
      objectId: suggestion.id,
      after: { kind: suggestion.kind, field: suggestion.field },
    });
  });
}

export async function dismissSuggestion(db: Database, actor: Actor, clientId: string, suggestionId: string): Promise<void> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  await db.transaction(async (tx) => {
    const suggestion = await findPendingSuggestion(tx, scope, suggestionId);
    await tx
      .update(brandSuggestions)
      .set({ status: "dismissed", reviewedBy: actor.userId, reviewedAt: new Date() })
      .where(eq(brandSuggestions.id, suggestion.id));
    await recordAudit(tx, {
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      actorType: "user",
      actorId: actor.userId,
      action: "brand.suggestion_dismissed",
      objectType: "brand_suggestion",
      objectId: suggestion.id,
    });
  });
}
