import { autoPublishSupport, type MediaKind, type PostStatus, type SocialPlatform } from "@sp/core";
import type { PostVariant, SocialAccount } from "@sp/db";
import { ActionButton } from "@/components/action-button";
import { Chip, buttonSecondarySm } from "@/components/ui";
import {
  SOCIAL_PLATFORM_LABEL,
  VARIANT_STATUS_LABEL,
  VARIANT_STATUS_TONE,
  formatDateTime,
} from "@/lib/labels";
import { retryVariantAction, skipVariantAction } from "../actions";
import { MarkPostedForm } from "./mark-posted-form";

type Account = Pick<SocialAccount, "platform" | "displayName" | "connectionMode" | "health" | "healthNote">;
type Media = { kind: MediaKind }[];

function connected(account: Account | undefined): boolean {
  return account?.connectionMode === "automatic" && account.health !== "disconnected";
}

export function postsAutomatically(variant: PostVariant, account: Account | undefined, media: Media): boolean {
  // Creative marked ready but kept outside the app never goes out on its own.
  if (variant.hasMedia && media.length === 0) return false;
  return connected(account) && autoPublishSupport(variant.platform, media) === "automatic";
}

function howItGoesOut(variant: PostVariant, account: Account | undefined, postStatus: PostStatus, media: Media): string {
  const label = SOCIAL_PLATFORM_LABEL[variant.platform];
  if (postsAutomatically(variant, account, media)) {
    return postStatus === "scheduled"
      ? `Posts to ${account!.displayName} on its own at the scheduled time.`
      : `Posts to ${account!.displayName} on its own once you schedule it.`;
  }
  const steps =
    media.length > 0
      ? `download the media above, post it on ${label}, then mark it as posted.`
      : `post it on ${label}, then mark it as posted.`;
  if (connected(account) && autoPublishSupport(variant.platform, media) === "manual_media") {
    const what =
      variant.platform === "linkedin"
        ? "Posts with media"
        : media.some((item) => item.kind === "video")
          ? "Videos"
          : "Posts with several images";
    return `${what} are not sent to ${label} automatically yet. At the scheduled time, ${steps}`;
  }
  return `You post this one. At the scheduled time, ${steps}`;
}

export function PublishingPanel({
  slug,
  postId,
  postStatus,
  variants,
  accounts,
  timezone,
  canPublish,
  media,
}: {
  slug: string;
  postId: string;
  postStatus: PostStatus;
  variants: PostVariant[];
  accounts: Account[];
  timezone: string;
  canPublish: boolean;
  media: Media;
}) {
  if (variants.length === 0) return null;
  const accountFor = (platform: SocialPlatform) => accounts.find((account) => account.platform === platform);

  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-base font-bold">Status by platform</h2>
        <p className="text-sm text-muted">Whether each one goes out on its own or needs you.</p>
      </div>

      <ul className="grid gap-3">
        {variants.map((variant) => {
          const account = accountFor(variant.platform);
          const automatic = postsAutomatically(variant, account, media);
          const open = variant.status !== "published" && variant.status !== "queued";

          return (
            <li key={variant.id} className="grid gap-2 rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{SOCIAL_PLATFORM_LABEL[variant.platform]}</span>
                <Chip tone={VARIANT_STATUS_TONE[variant.status]}>{VARIANT_STATUS_LABEL[variant.status]}</Chip>
              </div>

              {variant.status === "published" ? (
                <p className="text-sm text-muted">
                  {variant.publishedAt ? `Published ${formatDateTime(variant.publishedAt, timezone)}.` : "Published."}{" "}
                  {variant.publishedUrl && (
                    <a
                      href={variant.publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-accent underline underline-offset-2"
                    >
                      View the post
                    </a>
                  )}
                </p>
              ) : variant.status === "queued" ? (
                <p className="text-sm text-muted">Being published right now. Refresh in a minute.</p>
              ) : variant.status === "skipped" ? (
                <p className="text-sm text-muted">Skipped. It will not be posted on this platform.</p>
              ) : variant.status === "failed" ? (
                <p role="alert" className="rounded bg-crit-soft px-3 py-2 text-xs text-crit">
                  {variant.publishError ?? "Publishing failed."}
                </p>
              ) : (
                <p className="text-sm text-muted">{howItGoesOut(variant, account, postStatus, media)}</p>
              )}

              {/* Only for versions still waiting to go out; a failed one's error already says what to do. */}
              {account?.health === "needs_attention" &&
                account.healthNote &&
                (variant.status === "pending" || variant.status === "ready") && (
                <p className="rounded bg-warn-soft px-3 py-2 text-xs text-warn">{account.healthNote}</p>
              )}

              {canPublish && open && (
                <div className="grid gap-2">
                  <MarkPostedForm slug={slug} postId={postId} platform={variant.platform} />
                  <div className="flex flex-wrap gap-2">
                    {variant.status === "failed" && automatic && (
                      <ActionButton
                        action={retryVariantAction}
                        fields={{ slug, postId, platform: variant.platform }}
                        pendingText="Queuing..."
                        className={buttonSecondarySm}
                      >
                        Retry now
                      </ActionButton>
                    )}
                    {variant.status !== "skipped" && (
                      <ActionButton
                        action={skipVariantAction}
                        fields={{ slug, postId, platform: variant.platform }}
                        pendingText="Skipping..."
                        className={buttonSecondarySm}
                      >
                        Skip this platform
                      </ActionButton>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
