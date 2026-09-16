import { describe, expect, it } from "vitest";
import { CLIENT_ROLES, isAllowed, PERMISSIONS, type Permission } from "./permissions";

const assigned = { clientRole: "staff" } as const;
const notMember = { clientRole: null } as const;

describe("isAllowed", () => {
  it("lets agency admins act on any client in their agency", () => {
    expect(isAllowed({ agencyRole: "agency_admin" }, "content.edit", notMember)).toBe(true);
    expect(isAllowed({ agencyRole: "agency_admin" }, "client.create")).toBe(true);
  });

  it("limits staff to clients they are assigned to", () => {
    expect(isAllowed({ agencyRole: "manager" }, "content.edit", assigned)).toBe(true);
    expect(isAllowed({ agencyRole: "manager" }, "content.edit", notMember)).toBe(false);
    expect(isAllowed({ agencyRole: "writer" }, "calendar.view", notMember)).toBe(false);
  });

  it("never grants agency-level permissions through client assignment", () => {
    expect(isAllowed({ agencyRole: "manager" }, "team.manage")).toBe(false);
    expect(isAllowed({ agencyRole: "manager" }, "team.manage", assigned)).toBe(false);
    expect(isAllowed({ agencyRole: "manager" }, "content.edit")).toBe(false);
  });

  it("keeps each staff role inside its job", () => {
    expect(isAllowed({ agencyRole: "designer" }, "content.edit", assigned)).toBe(false);
    expect(isAllowed({ agencyRole: "designer" }, "creative.upload", assigned)).toBe(true);
    expect(isAllowed({ agencyRole: "writer" }, "approval.internal", assigned)).toBe(false);
    expect(isAllowed({ agencyRole: "writer" }, "post.publishNow", assigned)).toBe(false);
    expect(isAllowed({ agencyRole: "writer" }, "brand.suggest", assigned)).toBe(true);
    expect(isAllowed({ agencyRole: "writer" }, "brand.edit", assigned)).toBe(false);
  });

  it("lets every assigned staff member read the Brand Brain but only managers edit it", () => {
    expect(isAllowed({ agencyRole: "designer" }, "brand.view", assigned)).toBe(true);
    expect(isAllowed({ agencyRole: "designer" }, "brand.suggest", assigned)).toBe(false);
    expect(isAllowed({ agencyRole: "writer" }, "brand.suggest", assigned)).toBe(true);
    expect(isAllowed({ agencyRole: "manager" }, "brand.edit", assigned)).toBe(true);
    expect(isAllowed({ agencyRole: "client_user" }, "brand.view", { clientRole: "client_approver" })).toBe(false);
  });

  it("restricts client users to client-safe actions on their own client", () => {
    const client = { agencyRole: "client_user" } as const;
    expect(isAllowed(client, "approval.client", { clientRole: "client_approver" })).toBe(true);
    expect(isAllowed(client, "approval.client", { clientRole: "client_viewer" })).toBe(false);
    expect(isAllowed(client, "comment.create", { clientRole: "client_viewer" })).toBe(true);
    expect(isAllowed(client, "content.edit", { clientRole: "client_approver" })).toBe(false);
    expect(isAllowed(client, "calendar.view", notMember)).toBe(false);
    expect(isAllowed(client, "calendar.view", assigned)).toBe(false);
    expect(isAllowed(client, "client.view")).toBe(false);
  });

  it("reserves system settings for super admins", () => {
    expect(isAllowed({ agencyRole: "super_admin" }, "system.manage")).toBe(true);
    expect(isAllowed({ agencyRole: "agency_admin" }, "system.manage")).toBe(false);
  });

  it("gives client roles only 'own' grants and staff roles never 'own'", () => {
    const clientRoles = new Set<string>(CLIENT_ROLES);
    for (const [permission, rule] of Object.entries(PERMISSIONS) as [Permission, Record<string, string>][]) {
      for (const [holder, grant] of Object.entries(rule)) {
        if (clientRoles.has(holder)) expect(grant, `${permission}:${holder}`).toBe("own");
        else expect(grant, `${permission}:${holder}`).not.toBe("own");
      }
    }
  });
});
