import { ForbiddenError, InvalidInputError, NotFoundError } from "@sp/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "./client";
import { getClient, isKnownTimeZone, updateClientSettings } from "./clients";
import { createTestDatabase, seedTenancy, type TenancyFixture } from "./testing";
import { requireClientAccess } from "./access";

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

describe("isKnownTimeZone", () => {
  it("accepts the schema default, even though some ICU builds omit it from supportedValuesOf", () => {
    // A regression guard: this identifier resolves correctly in the runtime but
    // is not always listed by Intl.supportedValuesOf("timeZone"), and an
    // earlier version of this check rejected it, which would have corrupted
    // every client still on the default.
    expect(isKnownTimeZone("Asia/Kolkata")).toBe(true);
  });

  it("accepts an unambiguous zone with customers elsewhere", () => {
    expect(isKnownTimeZone("America/New_York")).toBe(true);
    expect(isKnownTimeZone("Europe/London")).toBe(true);
  });

  it("refuses a string that is not a timezone at all", () => {
    expect(isKnownTimeZone("Not/AZone")).toBe(false);
    expect(isKnownTimeZone("")).toBe(false);
  });
});

describe("updateClientSettings", () => {
  it("saves a client's timezone and reads it back, rather than falling back to something else", async () => {
    const client = f.clients.northwind.id;
    const updated = await updateClientSettings(db, f.actors.admin, client, {
      name: "Northwind Cloud",
      timezone: "Asia/Kolkata",
    });
    expect(updated.timezone).toBe("Asia/Kolkata");

    const scope = await requireClientAccess(db, f.actors.admin, "client.view", client);
    expect((await getClient(db, scope)).timezone).toBe("Asia/Kolkata");
  });

  it("moves a client to a genuinely different timezone for customers elsewhere", async () => {
    const client = f.clients.northwind.id;
    const updated = await updateClientSettings(db, f.actors.admin, client, {
      name: "Northwind Cloud",
      timezone: "America/New_York",
    });
    expect(updated.timezone).toBe("America/New_York");

    // Restore it so later tests in this file are not order-dependent.
    await updateClientSettings(db, f.actors.admin, client, { name: "Northwind Cloud", timezone: "Asia/Kolkata" });
  });

  it("refuses a timezone that is not real", async () => {
    await expect(
      updateClientSettings(db, f.actors.admin, f.clients.kaveri.id, {
        name: "Kaveri Industrial Labels",
        timezone: "Mars/Olympus_Mons",
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("refuses an empty name", async () => {
    await expect(
      updateClientSettings(db, f.actors.admin, f.clients.kaveri.id, { name: "   ", timezone: "Asia/Kolkata" }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("stops a writer from changing client settings", async () => {
    await expect(
      updateClientSettings(db, f.actors.writer, f.clients.kaveri.id, {
        name: "Kaveri Industrial Labels",
        timezone: "Asia/Kolkata",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hides another agency's client behind a not found error", async () => {
    await expect(
      updateClientSettings(db, f.actors.admin, f.clients.foreign.id, {
        name: "Renamed",
        timezone: "Asia/Kolkata",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
