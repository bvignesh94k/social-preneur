import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireClientAccess } from "./access";
import { findAccountsConnectedElsewhere, saveOAuthConnection } from "./accounts";
import type { Database } from "./client";
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

const connect = (clientId: string, pageId: string, actor = f.actors.admin) =>
  saveOAuthConnection(db, actor, clientId, "facebook", {
    displayName: `Page ${pageId}`,
    externalAccountId: pageId,
    accessTokenEncrypted: "iv:tag:data",
    refreshTokenEncrypted: null,
    tokenExpiresAt: null,
    grantedScopes: [],
  });

describe("findAccountsConnectedElsewhere", () => {
  it("reports Pages another client in the agency already uses, but not this client's own", async () => {
    await connect(f.clients.northwind.id, "page-northwind");
    await connect(f.clients.kaveri.id, "page-kaveri");

    const scope = await requireClientAccess(db, f.actors.admin, "accounts.connect", f.clients.kaveri.id);
    const inUse = await findAccountsConnectedElsewhere(db, scope, "facebook", ["page-northwind", "page-kaveri", "page-free"]);

    expect([...inUse]).toEqual(["page-northwind"]);
  });

  it("ignores other agencies entirely", async () => {
    await connect(f.clients.foreign.id, "page-foreign", f.actors.outsider);

    const scope = await requireClientAccess(db, f.actors.admin, "accounts.connect", f.clients.kaveri.id);
    const inUse = await findAccountsConnectedElsewhere(db, scope, "facebook", ["page-foreign"]);

    expect(inUse.size).toBe(0);
  });

  it("saves a connection that never expires", async () => {
    const row = await connect(f.clients.kaveri.id, "page-kaveri-2");
    expect(row.tokenExpiresAt).toBeNull();
  });
});
