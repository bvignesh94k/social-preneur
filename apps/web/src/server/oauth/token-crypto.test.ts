import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, TokenCryptoError } from "./token-crypto";

const key = randomBytes(32).toString("base64");

describe("token encryption", () => {
  it("round trips a token through encryption and decryption", () => {
    const stored = encryptToken("a-real-linkedin-access-token", key);
    expect(stored).not.toContain("a-real-linkedin-access-token");
    expect(decryptToken(stored, key)).toBe("a-real-linkedin-access-token");
  });

  it("produces a different ciphertext each time, so stored tokens are not comparable at rest", () => {
    const first = encryptToken("same-token", key);
    const second = encryptToken("same-token", key);
    expect(first).not.toBe(second);
  });

  it("refuses to encrypt without a key rather than storing plain text", () => {
    expect(() => encryptToken("token", undefined)).toThrow(TokenCryptoError);
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(() => encryptToken("token", "dG9vLXNob3J0")).toThrow(TokenCryptoError);
  });

  it("refuses to decrypt with the wrong key rather than returning garbage", () => {
    const stored = encryptToken("token", key);
    const wrongKey = randomBytes(32).toString("base64");
    expect(() => decryptToken(stored, wrongKey)).toThrow(TokenCryptoError);
  });

  it("refuses ciphertext that has been tampered with", () => {
    const stored = encryptToken("token", key);
    const [iv, tag, data] = stored.split(":");
    const tampered = `${iv}:${tag}:${data!.slice(0, -4)}abcd`;
    expect(() => decryptToken(tampered, key)).toThrow(TokenCryptoError);
  });

  it("refuses a value that is not in the iv:tag:data shape", () => {
    expect(() => decryptToken("not-a-real-token", key)).toThrow(TokenCryptoError);
  });
});
