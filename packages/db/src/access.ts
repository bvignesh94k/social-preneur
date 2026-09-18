import {
  ForbiddenError,
  isAllowed,
  NotFoundError,
  type Actor,
  type ClientRole,
  type Permission,
} from "@sp/core";
import { and, eq } from "drizzle-orm";
import type { Database } from "./client";
import { agencyMembers, clientMembers, clients } from "./schema";

declare const clientScopeBrand: unique symbol;

// Only requireClientAccess can produce this, so client-scoped queries cannot run without a permission check.
export type ClientScope = {
  readonly agencyId: string;
  readonly clientId: string;
  readonly clientRole: ClientRole | null;
  readonly actor: Actor;
  readonly [clientScopeBrand]: true;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function loadActor(db: Database, userId: string, agencyId: string): Promise<Actor | null> {
  if (!UUID_RE.test(agencyId)) return null;
  const [row] = await db
    .select({ role: agencyMembers.role })
    .from(agencyMembers)
    .where(
      and(
        eq(agencyMembers.userId, userId),
        eq(agencyMembers.agencyId, agencyId),
        eq(agencyMembers.status, "active"),
      ),
    )
    .limit(1);
  return row ? { userId, agencyId, agencyRole: row.role } : null;
}

export function requireAgencyPermission(actor: Actor, permission: Permission): void {
  if (!isAllowed(actor, permission)) throw new ForbiddenError(permission);
}

export async function requireClientAccess(
  db: Database,
  actor: Actor,
  permission: Permission,
  clientId: string,
): Promise<ClientScope> {
  if (!UUID_RE.test(clientId)) throw new NotFoundError("Client");

  const [row] = await db
    .select({ id: clients.id, memberRole: clientMembers.role })
    .from(clients)
    .leftJoin(
      clientMembers,
      and(eq(clientMembers.clientId, clients.id), eq(clientMembers.userId, actor.userId)),
    )
    .where(and(eq(clients.id, clientId), eq(clients.agencyId, actor.agencyId)))
    .limit(1);

  if (!row) throw new NotFoundError("Client");

  const target = { clientRole: (row.memberRole ?? null) as ClientRole | null };
  if (!isAllowed(actor, permission, target)) {
    // Hide the client's existence from people who cannot see it at all.
    if (!isAllowed(actor, "client.view", target)) throw new NotFoundError("Client");
    throw new ForbiddenError(permission);
  }

  return { agencyId: actor.agencyId, clientId: row.id, clientRole: target.clientRole, actor } as ClientScope;
}
