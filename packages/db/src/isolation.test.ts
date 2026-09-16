import { ForbiddenError, InvalidInputError, NotFoundError } from "@sp/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireClientAccess } from "./access";
import type { Database } from "./client";
import {
  assignClientMember,
  createClient,
  listClientMembers,
  listClientsForActor,
  requireClientBySlug,
  setClientPublishingPaused,
} from "./clients";
import { auditLogs, clientMembers } from "./schema";
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

async function dbError(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  throw new Error("Expected the query to fail");
}

describe("client visibility", () => {
  it("shows staff only the clients they are assigned to", async () => {
    const ids = (await listClientsForActor(db, f.actors.manager)).map((c) => c.id);
    expect(ids).toEqual([f.clients.kaveri.id]);
  });

  it("shows agency admins every client in their own agency only", async () => {
    const ids = (await listClientsForActor(db, f.actors.admin)).map((c) => c.id);
    expect(ids).toContain(f.clients.kaveri.id);
    expect(ids).toContain(f.clients.northwind.id);
    expect(ids).not.toContain(f.clients.foreign.id);
  });

  it("shows client users only their own client", async () => {
    const ids = (await listClientsForActor(db, f.actors.viewer)).map((c) => c.id);
    expect(ids).toEqual([f.clients.kaveri.id]);
  });
});

describe("requireClientAccess", () => {
  it("hides unassigned clients from staff as not found", async () => {
    await expect(
      requireClientAccess(db, f.actors.manager, "calendar.view", f.clients.northwind.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("hides another agency's client even from that agency's admins", async () => {
    await expect(
      requireClientAccess(db, f.actors.outsider, "calendar.view", f.clients.kaveri.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      requireClientAccess(db, f.actors.superAdmin, "calendar.view", f.clients.foreign.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns forbidden when the client is visible but the action is not allowed", async () => {
    await expect(
      requireClientAccess(db, f.actors.approver, "content.edit", f.clients.kaveri.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      requireClientAccess(db, f.actors.viewer, "approval.client", f.clients.kaveri.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("grants a scope for allowed actions", async () => {
    const scope = await requireClientAccess(db, f.actors.approver, "approval.client", f.clients.kaveri.id);
    expect(scope.clientId).toBe(f.clients.kaveri.id);
    expect(scope.agencyId).toBe(f.agency.id);
  });

  it("treats malformed ids as not found without hitting the database", async () => {
    await expect(
      requireClientAccess(db, f.actors.admin, "calendar.view", "not-a-uuid' OR 1=1 --"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("requireClientBySlug", () => {
  it("resolves slugs only inside the actor's agency", async () => {
    await expect(requireClientBySlug(db, f.actors.superAdmin, "client.view", "foreign")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const { client, scope } = await requireClientBySlug(db, f.actors.admin, "client.view", "kaveri");
    expect(client.id).toBe(f.clients.kaveri.id);
    expect(scope.clientRole).toBeNull();
  });

  it("applies assignment rules after resolving the slug", async () => {
    await expect(requireClientBySlug(db, f.actors.manager, "client.view", "northwind")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const { scope } = await requireClientBySlug(db, f.actors.manager, "client.view", "kaveri");
    expect(scope.clientRole).toBe("staff");
  });

  it("lists only that client's team", async () => {
    const { scope } = await requireClientBySlug(db, f.actors.admin, "client.view", "northwind");
    const members = await listClientMembers(db, scope);
    expect(members.map((m) => m.userId)).toEqual([f.actors.designer.userId]);
  });
});

describe("database guards", () => {
  it("rejects assigning a client to a member of a different agency", async () => {
    const message = await dbError(
      db.insert(clientMembers).values({
        agencyId: f.agency.id,
        clientId: f.clients.kaveri.id,
        userId: f.actors.outsider.userId,
        role: "staff",
      }),
    );
    expect(message).toMatch(/foreign key/i);
  });

  it("rejects a membership row whose agency does not own the client", async () => {
    const message = await dbError(
      db.insert(clientMembers).values({
        agencyId: f.otherAgency.id,
        clientId: f.clients.kaveri.id,
        userId: f.actors.outsider.userId,
        role: "staff",
      }),
    );
    expect(message).toMatch(/foreign key/i);
  });

  it("keeps the audit log append-only", async () => {
    await createClient(db, f.actors.admin, { name: "Audit Probe" });
    expect(await dbError(db.execute(sql`update audit_logs set action = 'tampered'`))).toMatch(/append-only/);
    expect(await dbError(db.execute(sql`delete from audit_logs`))).toMatch(/append-only/);
  });
});

describe("client operations", () => {
  it("lets only admins create clients and records an audit entry", async () => {
    await expect(createClient(db, f.actors.writer, { name: "Nope" })).rejects.toBeInstanceOf(ForbiddenError);

    const first = await createClient(db, f.actors.admin, { name: "Madurai Mills" });
    const second = await createClient(db, f.actors.admin, { name: "Madurai Mills" });
    expect(first.slug).toBe("madurai-mills");
    expect(second.slug).toBe("madurai-mills-2");

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.objectId, second.id));
    expect(logs.map((l) => l.action)).toEqual(["client.created"]);
    expect(logs[0]?.actorId).toBe(f.actors.admin.userId);
  });

  it("rejects mismatched roles when assigning members", async () => {
    await expect(
      assignClientMember(db, f.actors.admin, {
        clientId: f.clients.northwind.id,
        userId: f.actors.approver.userId,
        role: "staff",
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      assignClientMember(db, f.actors.admin, {
        clientId: f.clients.northwind.id,
        userId: f.actors.writer.userId,
        role: "client_viewer",
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("does not let managers assign team members", async () => {
    await expect(
      assignClientMember(db, f.actors.manager, {
        clientId: f.clients.kaveri.id,
        userId: f.actors.designer.userId,
        role: "staff",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a client approver pause their own client's publishing", async () => {
    const paused = await setClientPublishingPaused(db, f.actors.approver, f.clients.kaveri.id, true);
    expect(paused.publishingPausedAt).toBeInstanceOf(Date);

    await expect(
      setClientPublishingPaused(db, f.actors.approver, f.clients.northwind.id, true),
    ).rejects.toBeInstanceOf(NotFoundError);

    const resumed = await setClientPublishingPaused(db, f.actors.manager, f.clients.kaveri.id, false);
    expect(resumed.publishingPausedAt).toBeNull();
  });
});
