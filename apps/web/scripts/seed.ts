import type { Actor, AgencyRole, ClientRole } from "@sp/core";
import { assignClientMember, createClient, findAgencyBySlug, type Client, type NewClientInput } from "@sp/db";
import { createPgDatabase } from "@sp/db/pg";
import { accounts, agencies, agencyMembers, users } from "@sp/db/schema";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set. Add it to apps/web/.env.local.");
const password = process.env.SEED_PASSWORD ?? "Preneur@2026";

const { db, close } = createPgDatabase(databaseUrl, { maxConnections: 1 });

try {
  if (await findAgencyBySlug(db, "vturnu")) {
    console.log("Demo data is already present. Delete apps/web/.data to start fresh.");
  } else {
    await seed();
  }
} finally {
  await close();
}

async function seed() {
  const [agency] = await db
    .insert(agencies)
    .values({ name: "VTurnU Digital Solutions LLP", slug: "vturnu" })
    .returning();
  if (!agency) throw new Error("Agency insert failed");

  const passwordHash = await hashPassword(password);

  async function addUser(name: string, email: string, role: AgencyRole): Promise<Actor> {
    const userId = randomUUID();
    await db.insert(users).values({ id: userId, name, email, emailVerified: true });
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });
    await db.insert(agencyMembers).values({ agencyId: agency!.id, userId, role });
    return { userId, agencyId: agency!.id, agencyRole: role };
  }

  const owner = await addUser("Demo Owner", "owner@socialpreneur.test", "super_admin");
  await addUser("Anita Raman", "admin@socialpreneur.test", "agency_admin");
  const manager = await addUser("Meena Krishnan", "manager@socialpreneur.test", "manager");
  const writer = await addUser("Arun Prakash", "writer@socialpreneur.test", "writer");
  const designer = await addUser("Divya Selvam", "designer@socialpreneur.test", "designer");
  const approver = await addUser("Karthik Subramanian", "approver@socialpreneur.test", "client_user");

  const demoClients: NewClientInput[] = [
    { name: "Kaveri Industrial Labels", industry: "Manufacturing", website: "https://kaveri-labels.example", defaultLanguage: "en_ta" },
    { name: "Northwind Cloud", industry: "B2B SaaS", website: "https://northwind-cloud.example" },
    { name: "Aruvi Health Clinics", industry: "Healthcare", website: "https://aruvi-health.example", defaultLanguage: "en_ta" },
    { name: "Thari Handloom Store", industry: "Ecommerce", website: "https://thari-handloom.example", defaultLanguage: "en_ta" },
    { name: "Brightline Growth Studio", industry: "Digital marketing", website: "https://brightline.example" },
  ];

  const created: Client[] = [];
  for (const input of demoClients) created.push(await createClient(db, owner, input));
  const [kaveri, northwind, aruvi, thari, brightline] = created;
  if (!kaveri || !northwind || !aruvi || !thari || !brightline) throw new Error("Client seed failed");

  const assignments: [Client, Actor, ClientRole][] = [
    [kaveri, manager, "staff"],
    [northwind, manager, "staff"],
    [aruvi, manager, "staff"],
    [kaveri, writer, "staff"],
    [thari, writer, "staff"],
    [kaveri, designer, "staff"],
    [northwind, designer, "staff"],
    [thari, designer, "staff"],
    [brightline, designer, "staff"],
    [kaveri, approver, "client_approver"],
  ];
  for (const [client, member, role] of assignments) {
    await assignClientMember(db, owner, { clientId: client.id, userId: member.userId, role });
  }

  console.log("Demo data created. All demo accounts use the same password:", password);
  console.table([
    { role: "Super Admin", email: "owner@socialpreneur.test" },
    { role: "Agency Admin", email: "admin@socialpreneur.test" },
    { role: "Manager (Kaveri, Northwind, Aruvi)", email: "manager@socialpreneur.test" },
    { role: "Writer (Kaveri, Thari)", email: "writer@socialpreneur.test" },
    { role: "Designer (Kaveri, Northwind, Thari, Brightline)", email: "designer@socialpreneur.test" },
    { role: "Client Approver (Kaveri)", email: "approver@socialpreneur.test" },
  ]);
}
