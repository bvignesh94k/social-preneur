import type { SocialPlatform } from "@sp/core";
import { ActionButton } from "@/components/action-button";
import { Chip, buttonPrimarySm, buttonSecondarySm } from "@/components/ui";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import type { ConnectionView } from "@/server/oauth/connection-view";
import { disconnectOAuthAccountAction } from "./actions";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function ConnectionCard({
  slug,
  platform,
  connectHref,
  configured,
  connected,
  notConfiguredText,
}: {
  slug: string;
  platform: SocialPlatform;
  connectHref: string;
  configured: boolean;
  connected: ConnectionView | null;
  notConfiguredText: string;
}) {
  const label = SOCIAL_PLATFORM_LABEL[platform];

  if (!configured) {
    return <div className="rounded-md bg-sunk px-3 py-2 text-xs text-muted">{notConfiguredText}</div>;
  }

  if (!connected) {
    return (
      <a href={connectHref} className={`${buttonPrimarySm} justify-self-start`}>
        Connect with {label}
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
      {connected.health !== "ok" && connected.healthNote && (
        <p className="rounded bg-warn-soft px-3 py-2 text-xs text-warn">{connected.healthNote}</p>
      )}
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
        <a href={connectHref} className={buttonSecondarySm}>
          Reconnect
        </a>
        <ActionButton
          action={disconnectOAuthAccountAction}
          fields={{ slug, platform }}
          pendingText="Disconnecting..."
          className={buttonSecondarySm}
        >
          Disconnect
        </ActionButton>
      </div>
    </div>
  );
}
