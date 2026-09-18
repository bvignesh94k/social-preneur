import { createHmac, timingSafeEqual } from "node:crypto";

export interface OAuthStatePayload {
  clientId: string;
  platform: string;
  returnSlug: string;
  issuedAt: number;
}

const MAX_AGE_MS = 10 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// The state parameter round-trips through the platform's own servers, so it
// must be self-verifying: signed against tampering, and short-lived so a
// captured redirect cannot be replayed later against a different client.
export function createOAuthState(payload: Omit<OAuthStatePayload, "issuedAt">, secret: string): string {
  const full: OAuthStatePayload = { ...payload, issuedAt: Date.now() };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifyOAuthState(token: string, secret: string): OAuthStatePayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }

  if (Date.now() - payload.issuedAt > MAX_AGE_MS) return null;
  return payload;
}
