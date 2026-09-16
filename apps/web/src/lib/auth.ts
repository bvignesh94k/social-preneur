import "server-only";
import { accounts, rateLimits, sessions, users, verifications } from "@sp/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "./db";
import { env } from "./env";

const db = await getDb();

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts come from agency invitations, never public sign-up.
    disableSignUp: true,
    minPasswordLength: 10,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    // Serverless hosting runs many short-lived instances, so in-memory counts would not stop repeated guessing.
    storage: "database",
  },
  advanced: {
    ipAddress: {
      // Vercel sets x-vercel-forwarded-for itself, so visitors cannot fake it to dodge sign-in limits.
      ipAddressHeaders: ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"],
    },
  },
  // Must stay last so cookies set inside server actions reach the browser.
  plugins: [nextCookies()],
});
