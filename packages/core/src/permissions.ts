export const AGENCY_ROLES = [
  "super_admin",
  "agency_admin",
  "manager",
  "writer",
  "designer",
  "client_user",
] as const;
export type AgencyRole = (typeof AGENCY_ROLES)[number];

export const CLIENT_ROLES = ["staff", "client_approver", "client_viewer"] as const;
export type ClientRole = (typeof CLIENT_ROLES)[number];

// all: every client in the agency. assigned: staff member of that client. own: client user of that client.
type Grant = "all" | "assigned" | "own";
type GrantHolder = Exclude<AgencyRole, "client_user"> | Exclude<ClientRole, "staff">;
type Rule = Partial<Record<GrantHolder, Grant>>;

const ADMINS = { super_admin: "all", agency_admin: "all" } as const satisfies Rule;
const CLIENT_USERS = { client_approver: "own", client_viewer: "own" } as const satisfies Rule;
const ALL_STAFF = { ...ADMINS, manager: "assigned", writer: "assigned", designer: "assigned" } as const satisfies Rule;

export const PERMISSIONS = {
  "system.manage": { super_admin: "all" },
  "team.manage": ADMINS,
  "audit.view": ADMINS,
  "client.create": ADMINS,
  "client.archive": ADMINS,
  "client.assignTeam": ADMINS,
  "publishing.pauseAgency": ADMINS,

  "client.view": { ...ALL_STAFF, ...CLIENT_USERS },
  "calendar.view": { ...ALL_STAFF, ...CLIENT_USERS },
  "comment.create": { ...ALL_STAFF, ...CLIENT_USERS },
  "media.view": { ...ALL_STAFF, ...CLIENT_USERS },
  "analytics.view": { ...ADMINS, manager: "assigned", writer: "assigned", ...CLIENT_USERS },

  "brand.view": { ...ALL_STAFF },
  "accounts.connect": { ...ADMINS, manager: "assigned" },
  "brand.edit": { ...ADMINS, manager: "assigned" },
  "brand.suggest": { ...ADMINS, manager: "assigned", writer: "assigned" },
  "strategy.edit": { ...ADMINS, manager: "assigned" },
  "ideas.generate": { ...ADMINS, manager: "assigned", writer: "assigned" },
  "content.edit": { ...ADMINS, manager: "assigned", writer: "assigned" },
  "creative.view": { ...ALL_STAFF },
  "creative.upload": { ...ADMINS, manager: "assigned", designer: "assigned" },
  "approval.internal": { ...ADMINS, manager: "assigned" },
  "approval.client": { agency_admin: "all", client_approver: "own" },
  "post.schedule": { ...ADMINS, manager: "assigned" },
  "post.publishNow": { ...ADMINS, manager: "assigned" },
  "publishing.pauseClient": { ...ADMINS, manager: "assigned", client_approver: "own" },
} as const satisfies Record<string, Rule>;

export type Permission = keyof typeof PERMISSIONS;

export interface Actor {
  userId: string;
  agencyId: string;
  agencyRole: AgencyRole;
}

// Omit target for agency-level checks; clientRole is null when the actor is not a member of that client.
export function isAllowed(
  actor: Pick<Actor, "agencyRole">,
  permission: Permission,
  target?: { clientRole: ClientRole | null },
): boolean {
  const rule: Rule = PERMISSIONS[permission];

  if (actor.agencyRole === "client_user") {
    if (!target || target.clientRole === null || target.clientRole === "staff") return false;
    return rule[target.clientRole] === "own";
  }

  const grant = rule[actor.agencyRole];
  if (grant === "all") return true;
  if (grant === "assigned") return target?.clientRole === "staff";
  return false;
}
