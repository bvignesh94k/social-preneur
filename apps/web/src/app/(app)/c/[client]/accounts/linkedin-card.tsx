import { ActionButton } from "@/components/action-button";
import { Chip, buttonPrimarySm, buttonSecondarySm } from "@/components/ui";
import type { LinkedInConnectionView } from "@/server/oauth/linkedin-view";
import { disconnectOAuthAccountAction } from "./actions";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function LinkedInCard({
  slug,
  connected,
  configured,
}: {
  slug: string;
  connected: LinkedInConnectionView | null;
  configured: boolean;
}) {
  if (!configured) {
    return (
      <div className="rounded-md bg-sunk px-3 py-2 text-xs text-muted">
        Real connection needs <code>LINKEDIN_CLIENT_ID</code>, <code>LINKEDIN_CLIENT_SECRET</code> and{" "}
        <code>TOKEN_ENCRYPTION_KEY</code> in the environment.
      </div>
    );
  }

  if (!connected) {
    return (
      <a href={`/api/oauth/linkedin/connect?client=${slug}`} className={`${buttonPrimarySm} justify-self-start`}>
        Connect with LinkedIn
      </a>
    );
  }

  const tone = connected.health !== "ok" || connected.expiringSoon ? "warn" : "ok";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={tone}>{tone === "warn" ? "Reconnect soon" : "Connected"}</Chip>
        <span className="text-sm font-medium">{connected.displayName}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
        {connected.connectedAt && (
          <>
            <dt>Connected</dt>
            <dd>{formatDate(connected.connectedAt)}</dd>
          </>
        )}
        {connected.tokenExpiresAt && (
          <>
            <dt>Access expires</dt>
            <dd>{formatDate(connected.tokenExpiresAt)}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/oauth/linkedin/connect?client=${slug}`} className={buttonSecondarySm}>
          Reconnect
        </a>
        <ActionButton
          action={disconnectOAuthAccountAction}
          fields={{ slug, platform: "linkedin" }}
          pendingText="Disconnecting..."
          className={buttonSecondarySm}
        >
          Disconnect
        </ActionButton>
      </div>
    </div>
  );
}
