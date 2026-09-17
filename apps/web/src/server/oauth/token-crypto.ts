import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class TokenCryptoError extends Error {
  constructor(readonly code: "not_configured" | "invalid_key" | "corrupt") {
    super(code);
    this.name = "TokenCryptoError";
  }
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function loadKey(base64Key: string | undefined): Buffer {
  if (!base64Key) throw new TokenCryptoError("not_configured");
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new TokenCryptoError("invalid_key");
  return key;
}

// A stored OAuth token is the one piece of data in this app that lets someone
// post to a client's real social accounts, so it is never written in plain
// text. Encrypted as iv:tag:ciphertext, each base64, joined with colons so the
// three parts round-trip through a single text column without ambiguity.
export function encryptToken(plaintext: string, base64Key: string | undefined): string {
  const key = loadKey(base64Key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64")).join(":");
}

export function decryptToken(stored: string, base64Key: string | undefined): string {
  const key = loadKey(base64Key);
  const [ivPart, tagPart, dataPart] = stored.split(":");
  if (!ivPart || !tagPart || !dataPart) throw new TokenCryptoError("corrupt");

  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // A wrong key and a tampered ciphertext produce the same GCM auth failure,
    // so both are reported as corrupt rather than leaking which one occurred.
    throw new TokenCryptoError("corrupt");
  }
}
