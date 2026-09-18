import { ForbiddenError, InvalidInputError, NotFoundError } from "@sp/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireClientAccess } from "./access";
import {
  createFact,
  createOffering,
  createRule,
  getBrandCardSources,
  getBrandProfile,
  listFacts,
  listOfferings,
  reviewFact,
  saveBrandCard,
} from "./brand";
import type { Database } from "./client";
import { brandSuggestions } from "./schema";
import { createTestDatabase, seedTenancy, type TenancyFixture } from "./testing";
import {
  acceptSuggestion,
  claimWebsiteScan,
  completeWebsiteScan,
  dismissSuggestion,
  failWebsiteScan,
  getLatestWebsiteScan,
  getScanJobContext,
  listPendingSuggestions,
  listScanPages,
  startWebsiteScan,
  suggestionsFromAnalysis,
  type AnalysisForSuggestions,
} from "./website-scans";

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

const scopeFor = (actor: TenancyFixture["actors"][keyof TenancyFixture["actors"]], clientId: string) =>
  requireClientAccess(db, actor, "brand.view", clientId);

async function runScan(clientId: string, url = "https://kaveri.example/") {
  const scan = await startWebsiteScan(db, f.actors.manager, clientId, url);
  const claimed = await claimWebsiteScan(db, scan.id);
  if (!claimed) throw new Error("Scan was not claimed");
  return claimed;
}

describe("website scans", () => {
  it("allows only one active scan per client and only for editors", async () => {
    const clientId = f.clients.kaveri.id;
    await expect(startWebsiteScan(db, f.actors.writer, clientId, "https://kaveri.example/")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const scan = await startWebsiteScan(db, f.actors.manager, clientId, "https://kaveri.example/");
    await expect(startWebsiteScan(db, f.actors.manager, clientId, "https://kaveri.example/")).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    await failWebsiteScan(db, scan.id, "Test failure");
    const latest = await getLatestWebsiteScan(db, await scopeFor(f.actors.manager, clientId));
    expect(latest?.status).toBe("failed");
    expect(latest?.errorMessage).toBe("Test failure");
  });

  it("claims a queued scan only once", async () => {
    const scan = await startWebsiteScan(db, f.actors.manager, f.clients.kaveri.id, "https://kaveri.example/");
    expect(await claimWebsiteScan(db, scan.id)).not.toBeNull();
    expect(await claimWebsiteScan(db, scan.id)).toBeNull();
    await failWebsiteScan(db, scan.id, "done with test");
  });

  it("stores pages and suggestions, then applies accepted ones to the Brand Brain", async () => {
    const clientId = f.clients.kaveri.id;
    const scan = await runScan(clientId);
    await completeWebsiteScan(db, scan, {
      pages: [{ url: "https://kaveri.example/", title: "Home", category: "company", summary: "Homepage" }],
      pagesSkipped: 2,
      suggestions: [
        { kind: "profile_field", field: "description", value: "Thermal labels for factories.", sourceUrl: null },
        { kind: "profile_field", field: "targetLocations", value: ["Coimbatore", "Chennai"], sourceUrl: null },
        {
          kind: "offering",
          value: { kind: "product", name: "Barcode ribbons", summary: null, benefits: ["Sharp prints"] },
          sourceUrl: "https://kaveri.example/products",
        },
        {
          kind: "fact",
          value: { kind: "certification", statement: "ISO 14001 certified" },
          sourceUrl: "https://kaveri.example/quality",
        },
      ],
    });

    const scope = await scopeFor(f.actors.manager, clientId);
    expect((await getLatestWebsiteScan(db, scope))?.status).toBe("done");
    expect((await listScanPages(db, scope, scan.id)).map((p) => p.url)).toEqual(["https://kaveri.example/"]);

    const pending = await listPendingSuggestions(db, scope);
    expect(pending).toHaveLength(4);
    for (const suggestion of pending) await acceptSuggestion(db, f.actors.manager, clientId, suggestion.id);

    const profile = await getBrandProfile(db, scope);
    expect(profile?.description).toBe("Thermal labels for factories.");
    expect(profile?.targetLocations).toEqual(["Coimbatore", "Chennai"]);

    const offering = (await listOfferings(db, scope)).find((o) => o.name === "Barcode ribbons");
    expect(offering?.url).toBe("https://kaveri.example/products");

    const fact = (await listFacts(db, scope)).find((x) => x.statement === "ISO 14001 certified");
    expect(fact?.status).toBe("unverified");
    expect(fact?.sourceType).toBe("website");
    expect(fact?.sourceRef).toBe("https://kaveri.example/quality");

    expect(await listPendingSuggestions(db, scope)).toHaveLength(0);
    await expect(acceptSuggestion(db, f.actors.manager, clientId, pending[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("merges list suggestions with existing values instead of replacing them", async () => {
    const clientId = f.clients.kaveri.id;
    const scan = await runScan(clientId);
    await completeWebsiteScan(db, scan, {
      pages: [],
      pagesSkipped: 0,
      suggestions: [
        { kind: "profile_field", field: "targetLocations", value: ["chennai", "Madurai"], sourceUrl: null },
      ],
    });
    const scope = await scopeFor(f.actors.manager, clientId);
    const [suggestion] = await listPendingSuggestions(db, scope);
    await acceptSuggestion(db, f.actors.manager, clientId, suggestion!.id);
    expect((await getBrandProfile(db, scope))?.targetLocations).toEqual(["Coimbatore", "Chennai", "Madurai"]);
  });

  it("replaces unreviewed suggestions when a new scan finishes, and supports dismissing", async () => {
    const clientId = f.clients.kaveri.id;
    const first = await runScan(clientId);
    await completeWebsiteScan(db, first, {
      pages: [],
      pagesSkipped: 0,
      suggestions: [{ kind: "profile_field", field: "phone", value: "+91 98765 43210", sourceUrl: null }],
    });
    const second = await runScan(clientId);
    await completeWebsiteScan(db, second, {
      pages: [],
      pagesSkipped: 0,
      suggestions: [{ kind: "profile_field", field: "email", value: "sales@kaveri.example", sourceUrl: null }],
    });

    const scope = await scopeFor(f.actors.manager, clientId);
    const pending = await listPendingSuggestions(db, scope);
    expect(pending.map((s) => s.field)).toEqual(["email"]);

    await dismissSuggestion(db, f.actors.manager, clientId, pending[0]!.id);
    const [row] = await db.select().from(brandSuggestions).where(eq(brandSuggestions.id, pending[0]!.id));
    expect(row?.status).toBe("dismissed");
    expect(row?.reviewedBy).toBe(f.actors.manager.userId);
  });

  it("keeps suggestions inside their client", async () => {
    const scan = await runScan(f.clients.kaveri.id);
    await completeWebsiteScan(db, scan, {
      pages: [],
      pagesSkipped: 0,
      suggestions: [{ kind: "profile_field", field: "primaryCta", value: "Call now", sourceUrl: null }],
    });
    const [suggestion] = await listPendingSuggestions(db, await scopeFor(f.actors.manager, f.clients.kaveri.id));
    await expect(
      acceptSuggestion(db, f.actors.admin, f.clients.northwind.id, suggestion!.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(acceptSuggestion(db, f.actors.writer, f.clients.kaveri.id, suggestion!.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("suggestionsFromAnalysis", () => {
  const analysis: AnalysisForSuggestions = {
    profile: {
      description: "thermal labels for factories.",
      targetAudience: "Warehouse managers",
      targetLocations: ["coimbatore", "Hosur"],
      usps: [],
      primaryCta: null,
      phone: null,
      email: null,
      socialLinks: [
        { platform: "linkedin", url: "https://linkedin.com/company/kaveri-new" },
        { platform: "instagram", url: "https://instagram.com/kaveri" },
      ],
    },
    offerings: [{ kind: "product", name: "Void labels", summary: null, benefits: [], sourceUrl: "https://kaveri.example/void" }],
    facts: [
      { kind: "certification", statement: "ISO 9001:2015 certified", sourceUrl: "https://kaveri.example/quality" },
      { kind: "statistic", statement: "Ships to 12 countries", sourceUrl: "https://kaveri.example/about" },
    ],
  };

  it("suggests only changes, new list items, missing links and unknown facts", () => {
    const profile = {
      description: "Thermal labels for factories.",
      targetAudience: null,
      targetLocations: ["Coimbatore"],
      usps: [],
      primaryCta: null,
      phone: null,
      email: null,
      socialLinks: { linkedin: "https://linkedin.com/company/kaveri" },
    } as unknown as Parameters<typeof suggestionsFromAnalysis>[1]["profile"];

    const suggestions = suggestionsFromAnalysis(analysis, { profile, factStatements: ["iso 9001:2015 certified"] });

    const fields = suggestions.filter((s) => s.kind === "profile_field");
    expect(fields.map((s) => (s.kind === "profile_field" ? s.field : ""))).toEqual([
      "targetAudience",
      "targetLocations",
      "socialLinks",
    ]);
    expect(fields.find((s) => s.kind === "profile_field" && s.field === "targetLocations")?.value).toEqual(["Hosur"]);
    expect(fields.find((s) => s.kind === "profile_field" && s.field === "socialLinks")?.value).toEqual({
      instagram: "https://instagram.com/kaveri",
    });
    expect(suggestions.filter((s) => s.kind === "offering")).toHaveLength(1);
    expect(suggestions.filter((s) => s.kind === "fact").map((s) => s.kind === "fact" && s.value.statement)).toEqual([
      "Ships to 12 countries",
    ]);
  });

  it("loads the job context for a scan", async () => {
    const scan = await startWebsiteScan(db, f.actors.manager, f.clients.kaveri.id, "https://kaveri.example/");
    const context = await getScanJobContext(db, scan);
    expect(context.clientName).toBe("Kaveri Industrial Labels");
    expect(context.offeringNames).toContain("Barcode ribbons");
    expect(context.factStatements).toContain("ISO 14001 certified");
    await failWebsiteScan(db, scan.id, "context test done");
  });
});

describe("brand card sources", () => {
  it("includes only verified facts, active offerings and active rules", async () => {
    const clientId = f.clients.northwind.id;
    await createOffering(db, f.actors.admin, clientId, {
      kind: "service",
      name: "Managed backups",
      summary: null,
      benefits: [],
      audience: null,
      url: null,
    });
    const verified = await createFact(db, f.actors.admin, clientId, {
      kind: "statistic",
      statement: "99.9% uptime in 2025",
      sourceRef: null,
      offeringId: null,
    });
    await reviewFact(db, f.actors.admin, clientId, verified.id, "verified");
    await createFact(db, f.actors.admin, clientId, {
      kind: "award",
      statement: "Unchecked award",
      sourceRef: null,
      offeringId: null,
    });
    await createRule(db, f.actors.admin, clientId, "no_emojis", {});

    const scope = await requireClientAccess(db, f.actors.admin, "brand.view", clientId);
    const sources = await getBrandCardSources(db, scope);
    expect(sources.verifiedFacts.map((x) => x.statement)).toEqual(["99.9% uptime in 2025"]);
    expect(sources.offerings.map((o) => o.name)).toEqual(["Managed backups"]);
    expect(sources.activeRules.map((r) => r.type)).toEqual(["no_emojis"]);

    await saveBrandCard(db, f.actors.admin, clientId, { summary: "Cloud backups" }, "hash-1");
    const profile = await getBrandProfile(db, scope);
    expect(profile?.brandCard).toEqual({ summary: "Cloud backups" });
    expect(profile?.brandCardInputHash).toBe("hash-1");
    await expect(saveBrandCard(db, f.actors.designer, clientId, {}, "x")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
