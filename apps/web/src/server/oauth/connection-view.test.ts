import { describe, expect, it } from "vitest";
import { toConnectionView } from "./connection-view";

const now = new Date("2026-09-17T00:00:00Z");

function account(overrides: Partial<Parameters<typeof toConnectionView>[0]> = {}) {
  return {
    connectionMode: "automatic",
    displayName: "Kaveri Industrial Labels",
    connectedAt: new Date("2026-09-01T00:00:00Z"),
    tokenExpiresAt: new Date("2026-11-01T00:00:00Z"),
    health: "ok",
    ...overrides,
  } as Parameters<typeof toConnectionView>[0];
}

describe("toConnectionView", () => {
  it("returns null for an assisted account, since there is no real connection to show", () => {
    expect(toConnectionView(account({ connectionMode: "assisted" }), now)).toBeNull();
  });

  it("marks a token expiring next week as needing attention", () => {
    const view = toConnectionView(account({ tokenExpiresAt: new Date("2026-09-20T00:00:00Z") }), now);
    expect(view?.expiringSoon).toBe(true);
  });

  it("leaves a token that is not close to expiring alone", () => {
    const view = toConnectionView(account({ tokenExpiresAt: new Date("2026-11-01T00:00:00Z") }), now);
    expect(view?.expiringSoon).toBe(false);
  });

  it("treats no expiry information as not expiring soon rather than always alarming", () => {
    const view = toConnectionView(account({ tokenExpiresAt: null }), now);
    expect(view?.expiringSoon).toBe(false);
  });
});
