import { describe, expect, it, vi } from "vitest";
import { createOAuthState, verifyOAuthState } from "./state";

const secret = "test-secret-at-least-this-long-enough";

describe("OAuth state", () => {
  it("round trips the payload through signing and verification", () => {
    const token = createOAuthState({ clientId: "client-1", platform: "linkedin", returnSlug: "kaveri" }, secret);
    const payload = verifyOAuthState(token, secret);
    expect(payload).toMatchObject({ clientId: "client-1", platform: "linkedin", returnSlug: "kaveri" });
  });

  it("refuses a token signed with a different secret", () => {
    const token = createOAuthState({ clientId: "client-1", platform: "linkedin", returnSlug: "kaveri" }, secret);
    expect(verifyOAuthState(token, "a-different-secret-value-here")).toBeNull();
  });

  it("refuses a tampered payload even if the signature format still looks right", () => {
    const token = createOAuthState({ clientId: "client-1", platform: "linkedin", returnSlug: "kaveri" }, secret);
    const [, signature] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ clientId: "someone-elses-client", platform: "linkedin", returnSlug: "kaveri", issuedAt: Date.now() }),
    ).toString("base64url");
    expect(verifyOAuthState(`${tamperedBody}.${signature}`, secret)).toBeNull();
  });

  it("refuses a token that is missing its signature", () => {
    expect(verifyOAuthState("just-a-body-no-dot", secret)).toBeNull();
  });

  it("refuses a state older than 10 minutes, so a captured redirect cannot be replayed later", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const token = createOAuthState({ clientId: "client-1", platform: "linkedin", returnSlug: "kaveri" }, secret);

      vi.setSystemTime(new Date("2026-01-01T00:09:00Z"));
      expect(verifyOAuthState(token, secret)).not.toBeNull();

      vi.setSystemTime(new Date("2026-01-01T00:11:00Z"));
      expect(verifyOAuthState(token, secret)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
