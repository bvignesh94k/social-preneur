import { ForbiddenError, InvalidInputError, NotFoundError } from "@sp/core";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createFact,
  createOffering,
  createRule,
  deleteRule,
  listRules,
  reviewFact,
  saveBrandProfile,
  setOfferingStatus,
  updateFact,
  updateOffering,
  updateRule,
  type BrandProfileInput,
} from "./brand";
import type { Database } from "./client";
import { auditLogs } from "./schema";
import { createTestDatabase, seedTenancy, type TenancyFixture } from "./testing";

let db: Database;
let close: () => Promise<void>;
let f: TenancyFixture;

beforeAll(async () => {
  ({ db, close } = await createTestDatabase());
  f = await seedTenancy(db);
});

afterAll(async () => {
  await close();
});

const emptyProfile: BrandProfileInput = {
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

const product = (name: string) => ({
  kind: "product" as const,
  name,
  summary: null,
  benefits: [],
  audience: null,
  url: null,
});

async function auditActions(objectId: string) {
  const rows = await db.select().from(auditLogs).where(eq(auditLogs.objectId, objectId));
  return rows.map((r) => r.action);
}

describe("brand profile", () => {
  it("saves for assigned managers and audits only the fields that changed", async () => {
    const clientId = f.clients.kaveri.id;
    await saveBrandProfile(db, f.actors.manager, clientId, {
      ...emptyProfile,
      description: "Thermal labels and barcode printing for factories.",
      targetLocations: ["Coimbatore", "Chennai"],
    });
    await saveBrandProfile(db, f.actors.manager, clientId, {
      ...emptyProfile,
      description: "Thermal labels and barcode printing for factories.",
      targetLocations: ["Coimbatore", "Chennai"],
      primaryCta: "Request a sample",
    });

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.objectId, clientId), eq(auditLogs.objectType, "brand_profile")));
    expect(rows.map((r) => r.action)).toEqual(["brand.profile_created", "brand.profile_updated"]);
    expect(rows[1]?.after).toEqual({ primaryCta: "Request a sample" });
  });

  it("writes nothing to the audit log when nothing changed", async () => {
    const before = await auditActions(f.clients.kaveri.id);
    await saveBrandProfile(db, f.actors.manager, f.clients.kaveri.id, {
      ...emptyProfile,
      description: "Thermal labels and barcode printing for factories.",
      targetLocations: ["Coimbatore", "Chennai"],
      primaryCta: "Request a sample",
    });
    expect(await auditActions(f.clients.kaveri.id)).toEqual(before);
  });

  it("refuses writers, unassigned staff and other agencies", async () => {
    await expect(saveBrandProfile(db, f.actors.writer, f.clients.kaveri.id, emptyProfile)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(saveBrandProfile(db, f.actors.manager, f.clients.northwind.id, emptyProfile)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(saveBrandProfile(db, f.actors.outsider, f.clients.kaveri.id, emptyProfile)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("products and services", () => {
  it("blocks duplicate names per kind, ignoring letter case", async () => {
    await createOffering(db, f.actors.manager, f.clients.kaveri.id, product("Thermal Labels"));
    await expect(
      createOffering(db, f.actors.manager, f.clients.kaveri.id, product("thermal labels")),
    ).rejects.toThrow('already has a product called "thermal labels"');
    await expect(
      createOffering(db, f.actors.manager, f.clients.kaveri.id, { ...product("Thermal Labels"), kind: "service" }),
    ).resolves.toMatchObject({ kind: "service" });
  });

  it("renames, archives and restores with audit entries", async () => {
    const created = await createOffering(db, f.actors.admin, f.clients.kaveri.id, product("RFID tags"));
    const renamed = await updateOffering(db, f.actors.admin, f.clients.kaveri.id, created.id, product("RFID Tags"));
    expect(renamed.name).toBe("RFID Tags");
    await setOfferingStatus(db, f.actors.admin, f.clients.kaveri.id, created.id, "archived");
    await setOfferingStatus(db, f.actors.admin, f.clients.kaveri.id, created.id, "active");
    expect(await auditActions(created.id)).toEqual([
      "brand.offering_created",
      "brand.offering_updated",
      "brand.offering_archived",
      "brand.offering_restored",
    ]);
  });

  it("cannot edit another client's product through a different client id", async () => {
    const other = await createOffering(db, f.actors.admin, f.clients.northwind.id, product("Cloud backup"));
    await expect(
      updateOffering(db, f.actors.admin, f.clients.kaveri.id, other.id, product("Hijacked")),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("facts", () => {
  const fact = (statement: string, offeringId: string | null = null) => ({
    kind: "certification" as const,
    statement,
    sourceRef: null,
    offeringId,
  });

  it("keeps facts added by writers unverified even if they ask otherwise", async () => {
    const row = await createFact(db, f.actors.writer, f.clients.kaveri.id, fact("ISO 9001:2015 certified"), {
      markVerified: true,
    });
    expect(row.status).toBe("unverified");
    await expect(reviewFact(db, f.actors.writer, f.clients.kaveri.id, row.id, "verified")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("resets a verified fact to unverified when its wording changes", async () => {
    const row = await createFact(db, f.actors.manager, f.clients.kaveri.id, fact("25 years in business"), {
      markVerified: true,
    });
    expect(row.status).toBe("verified");

    const sameWords = await updateFact(db, f.actors.manager, f.clients.kaveri.id, row.id, fact("25 years in business"));
    expect(sameWords.status).toBe("verified");

    const edited = await updateFact(db, f.actors.manager, f.clients.kaveri.id, row.id, fact("26 years in business"));
    expect(edited.status).toBe("unverified");
    expect(edited.reviewedBy).toBeNull();
  });

  it("lets writers edit only their own unverified facts", async () => {
    const own = await createFact(db, f.actors.writer, f.clients.kaveri.id, fact("Serves 300 factories"));
    await expect(
      updateFact(db, f.actors.writer, f.clients.kaveri.id, own.id, fact("Serves 350 factories")),
    ).resolves.toMatchObject({ statement: "Serves 350 factories" });

    await reviewFact(db, f.actors.manager, f.clients.kaveri.id, own.id, "verified");
    await expect(
      updateFact(db, f.actors.writer, f.clients.kaveri.id, own.id, fact("Serves 400 factories")),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects linking a fact to another client's product", async () => {
    const foreignProduct = await createOffering(db, f.actors.admin, f.clients.northwind.id, product("Northwind CRM"));
    await expect(
      createFact(db, f.actors.admin, f.clients.kaveri.id, fact("Award winning", foreignProduct.id)),
    ).rejects.toThrow("does not belong to this client");
  });
});

describe("rules", () => {
  it("allows one hashtag limit per client but several blocked phrases", async () => {
    const clientId = f.clients.kaveri.id;
    await createRule(db, f.actors.manager, clientId, "max_hashtags", { max: "5" });
    await expect(createRule(db, f.actors.manager, clientId, "max_hashtags", { max: 3 })).rejects.toThrow(
      "already has that rule",
    );
    await createRule(db, f.actors.manager, clientId, "blocked_phrase", { phrase: "cheapest" });
    await createRule(db, f.actors.manager, clientId, "blocked_phrase", { phrase: "guaranteed results" });

    const rules = await listRules(db, {
      agencyId: f.agency.id,
      clientId,
      clientRole: "staff",
      actor: f.actors.manager,
    } as Parameters<typeof listRules>[1]);
    expect(rules.map((r) => r.type)).toEqual(["max_hashtags", "blocked_phrase", "blocked_phrase"]);
    expect(rules[0]?.value).toEqual({ max: 5 });
  });

  it("validates values, toggles and deletes rules", async () => {
    const clientId = f.clients.kaveri.id;
    await expect(createRule(db, f.actors.manager, clientId, "max_hashtags", { max: 99 })).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    const rule = await createRule(db, f.actors.manager, clientId, "custom", { instruction: "Use formal English." });
    const off = await updateRule(db, f.actors.manager, clientId, rule.id, { isActive: false });
    expect(off.isActive).toBe(false);
    await deleteRule(db, f.actors.manager, clientId, rule.id);
    expect(await auditActions(rule.id)).toEqual(["brand.rule_created", "brand.rule_updated", "brand.rule_deleted"]);
  });

  it("does not let writers change rules", async () => {
    await expect(
      createRule(db, f.actors.writer, f.clients.kaveri.id, "no_emojis", {}),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
