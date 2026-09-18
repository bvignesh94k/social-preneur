import {
  InvalidInputError,
  isAllowed,
  NotFoundError,
  slugify,
  type Actor,
  type AgencyRole,
  type ClientRole,
  type Permission,
} from "@sp/core";
import { and, asc, eq, isNull, like, or } from "drizzle-orm";
import { requireAgencyPermission, requireClientAccess, type ClientScope } from "./access";
import { recordAudit } from "./audit";
import type { Database } from "./client";
import { agencyMembers, clientMembers, clients, users } from "./schema";

export type Client = typeof clients.$inferSelect;

export interface NewClientInput {
  name: string;
  website?: string | null;
  industry?: string | null;
  timezone?: string;
  defaultLanguage?: Client["defaultLanguage"];
}

export async function createClient(db: Database, actor: Actor, input: NewClientInput): Promise<Client> {
  requireAgencyPermission(actor, "client.create");
  const name = input.name.trim();
  if (!name) throw new InvalidInputError("Client name is required.");

  return db.transaction(async (tx) => {
    const slug = await nextFreeSlug(tx, actor.agencyId, slugify(name));
    const [client] = await tx
      .insert(clients)
      .values({
        agencyId: actor.agencyId,
        name,
        slug,
        website: input.website ?? null,
        industry: input.industry ?? null,
        timezone: input.timezone ?? "Asia/Kolkata",
        defaultLanguage: input.defaultLanguage ?? "en",
      })
      .returning();
    if (!client) throw new Error("Client insert returned no row");

    await recordAudit(tx, {
      agencyId: actor.agencyId,
      clientId: client.id,
      actorType: "user",
      actorId: actor.userId,
      action: "client.created",
      objectType: "client",
      objectId: client.id,
      after: { name: client.name, slug: client.slug },
    });
    return client;
  });
}

export interface ClientSettingsInput {
  name: string;
  website?: string | null;
  industry?: string | null;
  timezone: string;
  country?: string;
}

// Different clients often have customers in a different timezone from the
// agency, and every scheduled post must fire at the wall clock time chosen for
// that client, not for the agency.
//
// This validates by asking the runtime to actually construct a formatter for
// the zone, rather than checking Intl.supportedValuesOf("timeZone"). The two
// are not the same thing: ICU builds vary in which name they treat as the
// canonical entry for a given zone, so a real, correctly behaving identifier
// like "Asia/Kolkata" can be entirely absent from supportedValuesOf() while
// still resolving correctly, and rejecting it here would corrupt every client
// that still has the schema default set.
export function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function updateClientSettings(
  db: Database,
  actor: Actor,
  clientId: string,
  input: ClientSettingsInput,
): Promise<Client> {
  const scope = await requireClientAccess(db, actor, "client.assignTeam", clientId);

  const name = input.name.trim();
  if (!name) throw new InvalidInputError("Client name is required.");
  if (!isKnownTimeZone(input.timezone)) {
    throw new InvalidInputError("Pick a timezone from the list, for example Asia/Kolkata or America/New_York.");
  }

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(clients).where(eq(clients.id, scope.clientId)).limit(1);
    if (!before) throw new NotFoundError("Client");

    const [row] = await tx
      .update(clients)
      .set({
        name,
        website: input.website?.trim() || null,
        industry: input.industry?.trim() || null,
        timezone: input.timezone,
        country: input.country?.trim() || before.country,
      })
      .where(eq(clients.id, scope.clientId))
      .returning();
    if (!row) throw new Error("Client update returned no row");

    if (before.timezone !== row.timezone) {
      await recordAudit(tx, {
        agencyId: scope.agencyId,
        clientId: row.id,
        actorType: "user",
        actorId: actor.userId,
        action: "client.timezone_changed",
        objectType: "client",
        objectId: row.id,
        before: { timezone: before.timezone },
        after: { timezone: row.timezone },
      });
    }

    return row;
  });
}

export async function listClientsForActor(db: Database, actor: Actor): Promise<Client[]> {
  if (isAllowed(actor, "client.view", { clientRole: null })) {
    return db
      .select()
      .from(clients)
      .where(and(eq(clients.agencyId, actor.agencyId), isNull(clients.archivedAt)))
      .orderBy(asc(clients.name));
  }

  const rows = await db
    .select({ client: clients, role: clientMembers.role })
    .from(clientMembers)
    .innerJoin(
      clients,
      and(eq(clients.id, clientMembers.clientId), eq(clients.agencyId, clientMembers.agencyId)),
    )
    .where(
      and(
        eq(clientMembers.userId, actor.userId),
        eq(clientMembers.agencyId, actor.agencyId),
        isNull(clients.archivedAt),
      ),
    )
    .orderBy(asc(clients.name));

  return rows.filter((r) => isAllowed(actor, "client.view", { clientRole: r.role })).map((r) => r.client);
}

export async function getClient(db: Database, scope: ClientScope): Promise<Client> {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, scope.clientId), eq(clients.agencyId, scope.agencyId)))
    .limit(1);
  if (!client) throw new NotFoundError("Client");
  return client;
}

export async function requireClientBySlug(
  db: Database,
  actor: Actor,
  permission: Permission,
  slug: string,
): Promise<{ scope: ClientScope; client: Client }> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.agencyId, actor.agencyId), eq(clients.slug, slug)))
    .limit(1);
  if (!row) throw new NotFoundError("Client");
  const scope = await requireClientAccess(db, actor, permission, row.id);
  return { scope, client: await getClient(db, scope) };
}

export interface ClientMemberRow {
  userId: string;
  name: string;
  email: string;
  role: ClientRole;
  agencyRole: AgencyRole;
}

export async function listClientMembers(db: Database, scope: ClientScope): Promise<ClientMemberRow[]> {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: clientMembers.role,
      agencyRole: agencyMembers.role,
    })
    .from(clientMembers)
    .innerJoin(
      agencyMembers,
      and(eq(agencyMembers.agencyId, clientMembers.agencyId), eq(agencyMembers.userId, clientMembers.userId)),
    )
    .innerJoin(users, eq(users.id, clientMembers.userId))
    .where(and(eq(clientMembers.clientId, scope.clientId), eq(clientMembers.agencyId, scope.agencyId)))
    .orderBy(asc(users.name));
}

export async function assignClientMember(
  db: Database,
  actor: Actor,
  input: { clientId: string; userId: string; role: ClientRole },
): Promise<void> {
  const scope = await requireClientAccess(db, actor, "client.assignTeam", input.clientId);

  const [member] = await db
    .select({ role: agencyMembers.role })
    .from(agencyMembers)
    .where(and(eq(agencyMembers.agencyId, scope.agencyId), eq(agencyMembers.userId, input.userId)))
    .limit(1);
  if (!member) throw new NotFoundError("Team member");

  const isClientUser = member.role === "client_user";
  if (isClientUser && input.role === "staff") {
    throw new InvalidInputError("Client users can only be added as approvers or viewers.");
  }
  if (!isClientUser && input.role !== "staff") {
    throw new InvalidInputError("Agency team members can only be added as staff.");
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(clientMembers)
      .values({ agencyId: scope.agencyId, clientId: scope.clientId, userId: input.userId, role: input.role })
      .onConflictDoUpdate({
        target: [clientMembers.clientId, clientMembers.userId],
        set: { role: input.role },
      });
    await recordAudit(tx, {
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      actorType: "user",
      actorId: actor.userId,
      action: "client.member_assigned",
      objectType: "client_member",
      objectId: input.userId,
      after: { role: input.role },
    });
  });
}

export async function setClientPublishingPaused(
  db: Database,
  actor: Actor,
  clientId: string,
  paused: boolean,
): Promise<Client> {
  const scope = await requireClientAccess(db, actor, "publishing.pauseClient", clientId);

  return db.transaction(async (tx) => {
    const [client] = await tx
      .update(clients)
      .set({ publishingPausedAt: paused ? new Date() : null })
      .where(and(eq(clients.id, scope.clientId), eq(clients.agencyId, scope.agencyId)))
      .returning();
    if (!client) throw new NotFoundError("Client");

    await recordAudit(tx, {
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      actorType: "user",
      actorId: actor.userId,
      action: paused ? "client.publishing_paused" : "client.publishing_resumed",
      objectType: "client",
      objectId: client.id,
    });
    return client;
  });
}

async function nextFreeSlug(db: Database, agencyId: string, base: string): Promise<string> {
  // base comes from slugify, so it contains no LIKE wildcards.
  const rows = await db
    .select({ slug: clients.slug })
    .from(clients)
    .where(and(eq(clients.agencyId, agencyId), or(eq(clients.slug, base), like(clients.slug, `${base}-%`))));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}
