import {
  ForbiddenError,
  InvalidInputError,
  isAllowed,
  normalizeRuleValue,
  NotFoundError,
  type Actor,
  type BrandColor,
  type BrandRuleType,
  type FactKind,
  type OfferingKind,
  type SocialLinks,
} from "@sp/core";
import { and, asc, desc, eq } from "drizzle-orm";
import { isUuid, requireClientAccess, type ClientScope } from "./access";
import { recordAudit } from "./audit";
import type { Database } from "./client";
import { isForeignKeyViolation, isUniqueViolation } from "./errors";
import { brandFacts, brandProfiles, brandRules, offerings } from "./schema";

export type BrandProfile = typeof brandProfiles.$inferSelect;
export type Offering = typeof offerings.$inferSelect;
export type BrandFact = typeof brandFacts.$inferSelect;
export type BrandRule = typeof brandRules.$inferSelect;

function diffFields<T extends object, K extends keyof T & string>(
  before: T | null,
  after: T,
  fields: readonly K[],
): { changed: K[]; before: Record<string, unknown> | null; after: Record<string, unknown> } {
  const changed = fields.filter((f) => JSON.stringify(before?.[f] ?? null) !== JSON.stringify(after[f] ?? null));
  const pick = (row: T) => Object.fromEntries(changed.map((f) => [f, row[f]]));
  return { changed, before: before ? pick(before) : null, after: pick(after) };
}

function audit(scope: ClientScope) {
  return { agencyId: scope.agencyId, clientId: scope.clientId, actorType: "user" as const, actorId: scope.actor.userId };
}

// ---------- Profile ----------

export interface BrandProfileInput {
  description: string | null;
  targetAudience: string | null;
  targetLocations: string[];
  usps: string[];
  toneOfVoice: string[];
  contentStyle: string | null;
  primaryCta: string | null;
  ctaUrl: string | null;
  phone: string | null;
  email: string | null;
  brandColors: BrandColor[];
  fonts: string[];
  preferredHashtags: string[];
  wordsToAvoid: string[];
  socialLinks: SocialLinks;
}

const PROFILE_FIELDS = [
  "description",
  "targetAudience",
  "targetLocations",
  "usps",
  "toneOfVoice",
  "contentStyle",
  "primaryCta",
  "ctaUrl",
  "phone",
  "email",
  "brandColors",
  "fonts",
  "preferredHashtags",
  "wordsToAvoid",
  "socialLinks",
] as const satisfies readonly (keyof BrandProfileInput)[];

export const EMPTY_BRAND_PROFILE: BrandProfileInput = {
  description: null,
  targetAudience: null,
  targetLocations: [],
  usps: [],
  toneOfVoice: [],
  contentStyle: null,
  primaryCta: null,
  ctaUrl: null,
  phone: null,
  email: null,
  brandColors: [],
  fonts: [],
  preferredHashtags: [],
  wordsToAvoid: [],
  socialLinks: {},
};

export async function updateBrandProfileFields(
  db: Database,
  actor: Actor,
  clientId: string,
  patch: Partial<BrandProfileInput>,
): Promise<BrandProfile> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  const current = await getBrandProfile(db, scope);
  const base = current
    ? (Object.fromEntries(PROFILE_FIELDS.map((f) => [f, current[f]])) as unknown as BrandProfileInput)
    : EMPTY_BRAND_PROFILE;
  return saveBrandProfile(db, actor, clientId, { ...base, ...patch });
}

export interface BrandCardSources {
  profile: BrandProfile | null;
  offerings: Offering[];
  verifiedFacts: BrandFact[];
  activeRules: BrandRule[];
}

export async function getBrandCardSources(db: Database, scope: ClientScope): Promise<BrandCardSources> {
  const [profile, offeringRows, factRows, ruleRows] = await Promise.all([
    getBrandProfile(db, scope),
    listOfferings(db, scope),
    listFacts(db, scope),
    listRules(db, scope),
  ]);
  return {
    profile,
    offerings: offeringRows.filter((o) => o.status === "active"),
    verifiedFacts: factRows.filter((f) => f.status === "verified"),
    activeRules: ruleRows.filter((r) => r.isActive),
  };
}

export async function saveBrandCard(
  db: Database,
  actor: Actor,
  clientId: string,
  card: Record<string, unknown>,
  inputHash: string,
): Promise<void> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  const generatedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(brandProfiles)
      .values({
        clientId: scope.clientId,
        agencyId: scope.agencyId,
        brandCard: card,
        brandCardGeneratedAt: generatedAt,
        brandCardInputHash: inputHash,
      })
      .onConflictDoUpdate({
        target: brandProfiles.clientId,
        set: { brandCard: card, brandCardGeneratedAt: generatedAt, brandCardInputHash: inputHash },
      });
    await recordAudit(tx, {
      ...audit(scope),
      action: "brand.card_generated",
      objectType: "brand_profile",
      objectId: scope.clientId,
    });
  });
}

export async function getBrandProfile(db: Database, scope: ClientScope): Promise<BrandProfile | null> {
  const [row] = await db
    .select()
    .from(brandProfiles)
    .where(and(eq(brandProfiles.clientId, scope.clientId), eq(brandProfiles.agencyId, scope.agencyId)))
    .limit(1);
  return row ?? null;
}

export async function saveBrandProfile(
  db: Database,
  actor: Actor,
  clientId: string,
  input: BrandProfileInput,
): Promise<BrandProfile> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  const values = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, input[f]])) as unknown as BrandProfileInput;

  return db.transaction(async (tx) => {
    const before = await getBrandProfile(tx, scope);
    const [saved] = await tx
      .insert(brandProfiles)
      .values({ ...values, clientId: scope.clientId, agencyId: scope.agencyId, updatedBy: actor.userId })
      .onConflictDoUpdate({
        target: brandProfiles.clientId,
        set: { ...values, updatedBy: actor.userId, updatedAt: new Date() },
      })
      .returning();
    if (!saved) throw new Error("Brand profile save returned no row");

    const diff = diffFields(before, saved, PROFILE_FIELDS);
    if (diff.changed.length > 0) {
      await recordAudit(tx, {
        ...audit(scope),
        action: before ? "brand.profile_updated" : "brand.profile_created",
        objectType: "brand_profile",
        objectId: scope.clientId,
        before: diff.before,
        after: diff.after,
      });
    }
    return saved;
  });
}

// ---------- Products and services ----------

export interface OfferingInput {
  kind: OfferingKind;
  name: string;
  summary: string | null;
  benefits: string[];
  audience: string | null;
  url: string | null;
}

const OFFERING_FIELDS = ["kind", "name", "summary", "benefits", "audience", "url"] as const;

function cleanOffering(input: OfferingInput): OfferingInput {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new InvalidInputError("Enter a name.");
  return { ...input, name };
}

function rethrowDuplicateOffering(error: unknown, input: OfferingInput): never {
  if (isUniqueViolation(error)) {
    throw new InvalidInputError(`This client already has a ${input.kind} called "${input.name}".`);
  }
  throw error;
}

async function findOffering(db: Database, scope: ClientScope, offeringId: string): Promise<Offering> {
  if (!isUuid(offeringId)) throw new NotFoundError("Product or service");
  const [row] = await db
    .select()
    .from(offerings)
    .where(and(eq(offerings.id, offeringId), eq(offerings.clientId, scope.clientId)))
    .limit(1);
  if (!row) throw new NotFoundError("Product or service");
  return row;
}

export async function listOfferings(db: Database, scope: ClientScope): Promise<Offering[]> {
  return db
    .select()
    .from(offerings)
    .where(and(eq(offerings.clientId, scope.clientId), eq(offerings.agencyId, scope.agencyId)))
    .orderBy(asc(offerings.status), asc(offerings.kind), asc(offerings.name));
}

export async function createOffering(
  db: Database,
  actor: Actor,
  clientId: string,
  input: OfferingInput,
): Promise<Offering> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  const clean = cleanOffering(input);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(offerings)
        .values({ ...clean, clientId: scope.clientId, agencyId: scope.agencyId, createdBy: actor.userId })
        .returning();
      if (!row) throw new Error("Offering insert returned no row");
      await recordAudit(tx, {
        ...audit(scope),
        action: "brand.offering_created",
        objectType: "offering",
        objectId: row.id,
        after: { kind: row.kind, name: row.name },
      });
      return row;
    });
  } catch (error) {
    return rethrowDuplicateOffering(error, clean);
  }
}

export async function updateOffering(
  db: Database,
  actor: Actor,
  clientId: string,
  offeringId: string,
  input: OfferingInput,
): Promise<Offering> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  const clean = cleanOffering(input);
  try {
    return await db.transaction(async (tx) => {
      const before = await findOffering(tx, scope, offeringId);
      const [row] = await tx
        .update(offerings)
        .set(clean)
        .where(and(eq(offerings.id, before.id), eq(offerings.clientId, scope.clientId)))
        .returning();
      if (!row) throw new NotFoundError("Product or service");
      const diff = diffFields(before, row, OFFERING_FIELDS);
      if (diff.changed.length > 0) {
        await recordAudit(tx, {
          ...audit(scope),
          action: "brand.offering_updated",
          objectType: "offering",
          objectId: row.id,
          before: diff.before,
          after: diff.after,
        });
      }
      return row;
    });
  } catch (error) {
    return rethrowDuplicateOffering(error, clean);
  }
}

export async function setOfferingStatus(
  db: Database,
  actor: Actor,
  clientId: string,
  offeringId: string,
  status: Offering["status"],
): Promise<Offering> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  return db.transaction(async (tx) => {
    const before = await findOffering(tx, scope, offeringId);
    const [row] = await tx
      .update(offerings)
      .set({ status })
      .where(and(eq(offerings.id, before.id), eq(offerings.clientId, scope.clientId)))
      .returning();
    if (!row) throw new NotFoundError("Product or service");
    if (before.status !== status) {
      await recordAudit(tx, {
        ...audit(scope),
        action: status === "archived" ? "brand.offering_archived" : "brand.offering_restored",
        objectType: "offering",
        objectId: row.id,
      });
    }
    return row;
  });
}

// ---------- Facts ----------

export interface FactInput {
  kind: FactKind;
  statement: string;
  sourceRef: string | null;
  offeringId: string | null;
}

const FACT_FIELDS = ["kind", "statement", "sourceRef", "offeringId"] as const;

function cleanFact(input: FactInput): FactInput {
  const statement = input.statement.trim().replace(/\s+/g, " ");
  if (!statement) throw new InvalidInputError("Enter the fact.");
  if (statement.length > 500) throw new InvalidInputError("Keep the fact under 500 characters.");
  if (input.offeringId !== null && !isUuid(input.offeringId)) {
    throw new InvalidInputError("Choose a product or service from the list.");
  }
  return { ...input, statement, sourceRef: input.sourceRef?.trim() || null };
}

function rethrowOfferingMismatch(error: unknown): never {
  if (isForeignKeyViolation(error)) {
    throw new InvalidInputError("That product or service does not belong to this client.");
  }
  throw error;
}

const canReviewFacts = (actor: Actor, scope: ClientScope) =>
  isAllowed(actor, "brand.edit", { clientRole: scope.clientRole });

async function findFact(db: Database, scope: ClientScope, factId: string): Promise<BrandFact> {
  if (!isUuid(factId)) throw new NotFoundError("Fact");
  const [row] = await db
    .select()
    .from(brandFacts)
    .where(and(eq(brandFacts.id, factId), eq(brandFacts.clientId, scope.clientId)))
    .limit(1);
  if (!row) throw new NotFoundError("Fact");
  return row;
}

export async function listFacts(db: Database, scope: ClientScope): Promise<BrandFact[]> {
  return db
    .select()
    .from(brandFacts)
    .where(and(eq(brandFacts.clientId, scope.clientId), eq(brandFacts.agencyId, scope.agencyId)))
    .orderBy(asc(brandFacts.status), desc(brandFacts.createdAt));
}

export async function createFact(
  db: Database,
  actor: Actor,
  clientId: string,
  input: FactInput,
  options: { markVerified?: boolean; sourceType?: BrandFact["sourceType"] } = {},
): Promise<BrandFact> {
  const scope = await requireClientAccess(db, actor, "brand.suggest", clientId);
  const clean = cleanFact(input);
  const verified = options.markVerified === true && canReviewFacts(actor, scope);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(brandFacts)
        .values({
          ...clean,
          clientId: scope.clientId,
          agencyId: scope.agencyId,
          sourceType: options.sourceType ?? "manual",
          status: verified ? "verified" : "unverified",
          reviewedBy: verified ? actor.userId : null,
          reviewedAt: verified ? new Date() : null,
          createdBy: actor.userId,
        })
        .returning();
      if (!row) throw new Error("Fact insert returned no row");
      await recordAudit(tx, {
        ...audit(scope),
        action: "brand.fact_created",
        objectType: "brand_fact",
        objectId: row.id,
        after: { kind: row.kind, statement: row.statement, status: row.status },
      });
      return row;
    });
  } catch (error) {
    return rethrowOfferingMismatch(error);
  }
}

export async function updateFact(
  db: Database,
  actor: Actor,
  clientId: string,
  factId: string,
  input: FactInput,
): Promise<BrandFact> {
  const scope = await requireClientAccess(db, actor, "brand.suggest", clientId);
  const clean = cleanFact(input);
  const reviewer = canReviewFacts(actor, scope);
  try {
    return await db.transaction(async (tx) => {
      const before = await findFact(tx, scope, factId);
      if (!reviewer && (before.createdBy !== actor.userId || before.status !== "unverified")) {
        throw new ForbiddenError("brand.edit");
      }
      const contentChanged = diffFields(before, { ...before, ...clean }, FACT_FIELDS).changed.length > 0;
      // Any change to what a fact says must be verified again before AI may use it.
      const set = contentChanged ? { ...clean, status: "unverified" as const, reviewedBy: null, reviewedAt: null } : clean;
      const [row] = await tx
        .update(brandFacts)
        .set(set)
        .where(and(eq(brandFacts.id, before.id), eq(brandFacts.clientId, scope.clientId)))
        .returning();
      if (!row) throw new NotFoundError("Fact");
      const diff = diffFields(before, row, [...FACT_FIELDS, "status"]);
      if (diff.changed.length > 0) {
        await recordAudit(tx, {
          ...audit(scope),
          action: "brand.fact_updated",
          objectType: "brand_fact",
          objectId: row.id,
          before: diff.before,
          after: diff.after,
        });
      }
      return row;
    });
  } catch (error) {
    return rethrowOfferingMismatch(error);
  }
}

export async function reviewFact(
  db: Database,
  actor: Actor,
  clientId: string,
  factId: string,
  decision: "verified" | "rejected",
): Promise<BrandFact> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  if (!isUuid(factId)) throw new NotFoundError("Fact");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(brandFacts)
      .set({ status: decision, reviewedBy: actor.userId, reviewedAt: new Date() })
      .where(and(eq(brandFacts.id, factId), eq(brandFacts.clientId, scope.clientId)))
      .returning();
    if (!row) throw new NotFoundError("Fact");
    await recordAudit(tx, {
      ...audit(scope),
      action: decision === "verified" ? "brand.fact_verified" : "brand.fact_rejected",
      objectType: "brand_fact",
      objectId: row.id,
      after: { status: row.status },
    });
    return row;
  });
}

// ---------- Rules ----------

async function findRule(db: Database, scope: ClientScope, ruleId: string): Promise<BrandRule> {
  if (!isUuid(ruleId)) throw new NotFoundError("Rule");
  const [row] = await db
    .select()
    .from(brandRules)
    .where(and(eq(brandRules.id, ruleId), eq(brandRules.clientId, scope.clientId)))
    .limit(1);
  if (!row) throw new NotFoundError("Rule");
  return row;
}

export async function listRules(db: Database, scope: ClientScope): Promise<BrandRule[]> {
  return db
    .select()
    .from(brandRules)
    .where(and(eq(brandRules.clientId, scope.clientId), eq(brandRules.agencyId, scope.agencyId)))
    .orderBy(asc(brandRules.createdAt));
}

export async function createRule(
  db: Database,
  actor: Actor,
  clientId: string,
  type: BrandRuleType,
  value: unknown,
): Promise<BrandRule> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  const normalized = normalizeRuleValue(type, value);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(brandRules)
        .values({ type, value: normalized, clientId: scope.clientId, agencyId: scope.agencyId, createdBy: actor.userId })
        .returning();
      if (!row) throw new Error("Rule insert returned no row");
      await recordAudit(tx, {
        ...audit(scope),
        action: "brand.rule_created",
        objectType: "brand_rule",
        objectId: row.id,
        after: { type: row.type, value: row.value },
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new InvalidInputError("This client already has that rule. Change the existing one instead.");
    }
    throw error;
  }
}

export async function updateRule(
  db: Database,
  actor: Actor,
  clientId: string,
  ruleId: string,
  patch: { value?: unknown; isActive?: boolean },
): Promise<BrandRule> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  return db.transaction(async (tx) => {
    const before = await findRule(tx, scope, ruleId);
    const set: Partial<Pick<BrandRule, "value" | "isActive">> = {};
    if (patch.value !== undefined) set.value = normalizeRuleValue(before.type, patch.value);
    if (patch.isActive !== undefined) set.isActive = patch.isActive;
    if (Object.keys(set).length === 0) return before;

    const [row] = await tx
      .update(brandRules)
      .set(set)
      .where(and(eq(brandRules.id, before.id), eq(brandRules.clientId, scope.clientId)))
      .returning();
    if (!row) throw new NotFoundError("Rule");
    const diff = diffFields(before, row, ["value", "isActive"]);
    if (diff.changed.length > 0) {
      await recordAudit(tx, {
        ...audit(scope),
        action: "brand.rule_updated",
        objectType: "brand_rule",
        objectId: row.id,
        before: diff.before,
        after: diff.after,
      });
    }
    return row;
  });
}

export async function deleteRule(db: Database, actor: Actor, clientId: string, ruleId: string): Promise<void> {
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  await db.transaction(async (tx) => {
    const before = await findRule(tx, scope, ruleId);
    await tx.delete(brandRules).where(and(eq(brandRules.id, before.id), eq(brandRules.clientId, scope.clientId)));
    await recordAudit(tx, {
      ...audit(scope),
      action: "brand.rule_deleted",
      objectType: "brand_rule",
      objectId: before.id,
      before: { type: before.type, value: before.value },
    });
  });
}
