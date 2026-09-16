import { InvalidInputError } from "@sp/core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bootstrapAgency, hasAnyAgency } from "./bootstrap";
import { accounts, agencyMembers, auditLogs } from "./schema";
import { createTestDatabase, seedTenancy } from "./testing";

const owner = {
  agencyName: "VTurnU Digital Solutions LLP",
  ownerName: "Vignesh",
  email: "owner@example.com",
  passwordHash: "hashed-password",
};

describe("bootstrapAgency", () => {
  it("creates the first agency with a super admin who can sign in, exactly once", async () => {
    const { db, close } = await createTestDatabase();
    try {
      expect(await hasAnyAgency(db)).toBe(false);
      const created = await bootstrapAgency(db, owner);
      expect(await hasAnyAgency(db)).toBe(true);

      const [member] = await db.select().from(agencyMembers).where(eq(agencyMembers.userId, created.userId));
      expect(member?.role).toBe("super_admin");

      const [account] = await db.select().from(accounts).where(eq(accounts.userId, created.userId));
      expect(account?.providerId).toBe("credential");
      expect(account?.password).toBe("hashed-password");

      const logs = await db.select().from(auditLogs).where(eq(auditLogs.objectId, created.agencyId));
      expect(logs.map((log) => log.action)).toEqual(["agency.bootstrapped"]);

      await expect(bootstrapAgency(db, { ...owner, email: "second@example.com" })).rejects.toBeInstanceOf(
        InvalidInputError,
      );
    } finally {
      await close();
    }
  });

  it("refuses to run on a database that already has agencies", async () => {
    const { db, close } = await createTestDatabase();
    try {
      await seedTenancy(db);
      await expect(bootstrapAgency(db, owner)).rejects.toThrow("Setup has already been completed.");
    } finally {
      await close();
    }
  });
});
