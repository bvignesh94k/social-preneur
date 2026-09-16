import { PGlite } from "@electric-sql/pglite";
import type { Actor, AgencyRole, ClientRole } from "@sp/core";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { uuidv7 } from "uuidv7";
import type { Database } from "./client";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  return { db, close: () => client.close() };
}

function one<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new Error("Expected a row");
  return row;
}

export async function seedTenancy(db: Database) {
  const [agency, otherAgency] = await db
    .insert(schema.agencies)
    .values([
      { name: "VTurnU Digital Solutions", slug: "vturnu" },
      { name: "Other Agency", slug: "other-agency" },
    ])
    .returning();
  if (!agency || !otherAgency) throw new Error("Agency seed failed");

  async function member(name: string, agencyId: string, role: AgencyRole): Promise<Actor> {
    const user = one(
      await db
        .insert(schema.users)
        .values({ id: uuidv7(), name, email: `${name.toLowerCase()}@example.test` })
        .returning(),
    );
    await db.insert(schema.agencyMembers).values({ agencyId, userId: user.id, role });
    return { userId: user.id, agencyId, agencyRole: role };
  }

  const actors = {
    superAdmin: await member("Sam", agency.id, "super_admin"),
    admin: await member("Anita", agency.id, "agency_admin"),
    manager: await member("Meena", agency.id, "manager"),
    writer: await member("Wasim", agency.id, "writer"),
    designer: await member("Divya", agency.id, "designer"),
    approver: await member("Karthik", agency.id, "client_user"),
    viewer: await member("Vani", agency.id, "client_user"),
    outsider: await member("Oscar", otherAgency.id, "agency_admin"),
  };

  const [kaveri, northwind] = await db
    .insert(schema.clients)
    .values([
      { agencyId: agency.id, name: "Kaveri Industrial Labels", slug: "kaveri", industry: "Manufacturing", defaultLanguage: "en_ta" },
      { agencyId: agency.id, name: "Northwind Cloud", slug: "northwind", industry: "B2B SaaS" },
    ])
    .returning();
  const foreign = one(
    await db
      .insert(schema.clients)
      .values({ agencyId: otherAgency.id, name: "Foreign Client", slug: "foreign" })
      .returning(),
  );
  if (!kaveri || !northwind) throw new Error("Client seed failed");

  const assign = (clientId: string, actor: Actor, role: ClientRole) =>
    db.insert(schema.clientMembers).values({ agencyId: agency.id, clientId, userId: actor.userId, role });

  await assign(kaveri.id, actors.manager, "staff");
  await assign(kaveri.id, actors.writer, "staff");
  await assign(northwind.id, actors.designer, "staff");
  await assign(kaveri.id, actors.approver, "client_approver");
  await assign(kaveri.id, actors.viewer, "client_viewer");

  return { agency, otherAgency, clients: { kaveri, northwind, foreign }, actors };
}

export type TenancyFixture = Awaited<ReturnType<typeof seedTenancy>>;
