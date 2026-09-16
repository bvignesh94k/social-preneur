import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "sp_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type AdminConfig = { email: string; passwordHash: string; secret: string };

export function getAdminConfig(): AdminConfig | null {
  const email = process.env.ADMIN_EMAIL;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const secret = process.env.SESSION_SECRET;
  if (!email || !passwordHash || !secret) return null;
  return { email: email.toLowerCase(), passwordHash, secret };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  // Colon separated, not "$": dotenv expands $tokens and would mangle the hash.
  const [scheme, salt, expected] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(email: string, secret: string): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ sub: email, exp: expiresAt })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readSessionToken(token: string, secret: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub: string; exp: number };
  if (typeof claims.exp !== "number" || claims.exp < Date.now()) return null;
  return claims.sub;
}

export async function getSession(): Promise<{ email: string } | null> {
  const config = getAdminConfig();
  if (!config) return null;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const email = readSessionToken(token, config.secret);
  return email ? { email } : null;
}
