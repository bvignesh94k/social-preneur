import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { META_PICK_MAX_AGE_SECONDS, openMetaPick, sealMetaPick } from "./meta-pick";

const KEY = randomBytes(32).toString("base64");
const who = { userId: "user-1", clientId: "client-1" };

describe("Facebook Page picker cookie", () => {
  it("round-trips for the same person and client", () => {
    const sealed = sealMetaPick({ userToken: "tok", ...who }, KEY, 1_000);
    expect(openMetaPick(sealed, KEY, who, 2_000)).toMatchObject({ userToken: "tok", ...who });
  });

  it("does not store the token in readable form", () => {
    expect(sealMetaPick({ userToken: "very-secret-token", ...who }, KEY)).not.toContain("very-secret-token");
  });

  it("refuses another person, another client, or an expired pick", () => {
    const sealed = sealMetaPick({ userToken: "tok", ...who }, KEY, 1_000);
    expect(openMetaPick(sealed, KEY, { ...who, userId: "user-2" }, 2_000)).toBeNull();
    expect(openMetaPick(sealed, KEY, { ...who, clientId: "client-2" }, 2_000)).toBeNull();
    expect(openMetaPick(sealed, KEY, who, 1_000 + META_PICK_MAX_AGE_SECONDS * 1000 + 1)).toBeNull();
  });

  it("refuses a missing, tampered, or wrongly keyed cookie", () => {
    const sealed = sealMetaPick({ userToken: "tok", ...who }, KEY);
    const [iv, tag, data] = sealed.split(":") as [string, string, string];
    const flipped = `${iv}:${tag}:${data[0] === "A" ? "B" : "A"}${data.slice(1)}`;
    expect(openMetaPick(undefined, KEY, who)).toBeNull();
    expect(openMetaPick(flipped, KEY, who)).toBeNull();
    expect(openMetaPick(sealed, randomBytes(32).toString("base64"), who)).toBeNull();
  });
});
