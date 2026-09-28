import { decryptToken, encryptToken } from "./token-crypto";

export const META_PICK_COOKIE = "sp_meta_pick";
export const META_PICK_MAX_AGE_SECONDS = 15 * 60;

// Between Facebook's redirect and the person choosing a Page, the user token
// waits in an encrypted cookie bound to who connected and for which client.
// Nothing is written to the database until a Page is actually chosen.
export interface MetaPick {
  userToken: string;
  userId: string;
  clientId: string;
  expiresAt: number;
}

export function sealMetaPick(pick: Omit<MetaPick, "expiresAt">, key: string, now = Date.now()): string {
  const full: MetaPick = { ...pick, expiresAt: now + META_PICK_MAX_AGE_SECONDS * 1000 };
  return encryptToken(JSON.stringify(full), key);
}

export function openMetaPick(
  sealed: string | undefined,
  key: string,
  expected: { userId: string; clientId: string },
  now = Date.now(),
): MetaPick | null {
  if (!sealed) return null;
  let pick: MetaPick;
  try {
    pick = JSON.parse(decryptToken(sealed, key)) as MetaPick;
  } catch {
    return null;
  }
  if (pick.userId !== expected.userId || pick.clientId !== expected.clientId || pick.expiresAt < now) return null;
  return pick;
}
