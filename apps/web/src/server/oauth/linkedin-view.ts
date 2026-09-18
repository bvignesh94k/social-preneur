import type { SocialAccount } from "@sp/db";

// Anything inside a week of expiring reads as needing attention before it
// actually breaks, rather than surprising the admin the morning it lapses.
const SOON_MS = 7 * 24 * 60 * 60 * 1000;

export interface LinkedInConnectionView {
  displayName: string;
  connectedAt: Date | null;
  tokenExpiresAt: Date | null;
  health: SocialAccount["health"];
  expiringSoon: boolean;
}

export function toLinkedInView(account: SocialAccount, now: Date): LinkedInConnectionView | null {
  if (account.connectionMode !== "automatic") return null;
  return {
    displayName: account.displayName,
    connectedAt: account.connectedAt,
    tokenExpiresAt: account.tokenExpiresAt,
    health: account.health,
    expiringSoon: account.tokenExpiresAt ? account.tokenExpiresAt.getTime() - now.getTime() < SOON_MS : false,
  };
}
