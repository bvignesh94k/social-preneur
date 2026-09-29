import {
  CATEGORY_LABELS,
  PLATFORM_RULES,
  SOCIAL_PLATFORMS,
  STATUS_LABELS,
  autoPublishSupport,
  hasBlocker,
  timeIn,
  todayIn,
  type SocialPlatform,
} from "@sp/core";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Chip, buttonSecondarySm } from "@/components/ui";
import { getPostDetail } from "@/data/content";
import { POST_STATUS_TONE, SOCIAL_PLATFORM_LABEL, VARIANT_STATUS_LABEL, VARIANT_STATUS_TONE } from "@/lib/labels";
import { duplicatePostAction, setPostStatusAction } from "../actions";
import { MediaUploader } from "./media-uploader";
import { PlatformPicker, type PlatformOption } from "./platform-picker";
import { PostForm } from "./post-form";
import { PostPreview } from "./post-preview";
import { PublishingPanel, postsAutomatically } from "./publishing-panel";
import { ScheduleForm, type ReadinessItem } from "./schedule-form";
import { VariantForm } from "./variant-form";

export const metadata: Metadata = { title: "Post" };

function Card({ step, title, description, children }: { step?: number; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        {step && (
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-surface">
            {step}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-6">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function PostPage({ params }: PageProps<"/c/[client]/content/[postId]">) {
  const { client: slug, postId } = await params;
  const { client, can, post, accounts, offerings, today, upload } = await getPostDetail(slug, postId);

  const variantFor = (platform: SocialPlatform) => post.variants.find((variant) => variant.platform === platform);
  const accountFor = (platform: SocialPlatform) => accounts.find((account) => account.platform === platform);
  const media = post.media.map(({ id, kind, url, fileName, width, height, sizeBytes }) => ({
    id,
    kind,
    url,
    fileName,
    width,
    height,
    sizeBytes,
  }));
  const selected = post.variants.map((variant) => variant.platform);
  const published = post.status === "published";

  // Connected platforms first, since those are the ones that post on their own.
  const options: PlatformOption[] = SOCIAL_PLATFORMS.map((platform) => {
    const account = accountFor(platform);
    const variant = variantFor(platform);
    return {
      platform,
      selected: variant !== undefined,
      locked: variant?.status === "published" || variant?.status === "queued",
      account: account
        ? {
            displayName: account.displayName,
            connected: account.connectionMode === "automatic" && account.health !== "disconnected",
            needsAttention: account.health === "needs_attention",
          }
        : null,
      support: autoPublishSupport(platform, media),
    };
  }).sort((a, b) => Number(Boolean(b.account?.connected)) - Number(Boolean(a.account?.connected)));

  // What stands between this post and going out, in plain words.
  const blockers = post.variants
    .filter((variant) => variant.status !== "skipped" && hasBlocker(variant.issues))
    .map((variant) => {
      const issue = variant.issues.find((i) => i.level === "blocker")?.message ?? "not ready";
      return `${SOCIAL_PLATFORM_LABEL[variant.platform]}: ${issue}`;
    });

  const needsMedia = selected.some((platform) => PLATFORM_RULES[platform].requiresMedia);
  const checklist: ReadinessItem[] = [
    { label: "Platforms picked", done: selected.length > 0 },
    { label: "Caption written", done: post.variants.length > 0 ? post.variants.every((v) => v.caption.trim()) : Boolean(post.caption) },
    ...(needsMedia || media.length > 0
      ? [{ label: needsMedia ? "Image or video added (Instagram needs one)" : "Image or video added", done: media.length > 0 }]
      : []),
    { label: "Every platform ready", done: selected.length > 0 && blockers.length === 0 },
  ];

  const automaticCount = post.variants.filter((variant) => postsAutomatically(variant, accountFor(variant.platform), media)).length;

  const nextStatuses = {
    draft: ["needs_creative"],
    needs_creative: ["draft"],
    ready: ["draft"],
    scheduled: [],
    idea: ["draft"],
    failed: [],
    published: [],
    archived: ["draft"],
  }[post.status];

  const previewAccount = selected.map(accountFor).find(Boolean)?.displayName ?? client.name;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link href={`/c/${slug}/content`} className="justify-self-start text-sm text-muted hover:text-ink">
          &larr; Back to calendar
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-balance">{post.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {CATEGORY_LABELS[post.category]}
              {post.plannedDate ? ` · planned for ${post.plannedDate}` : " · no day chosen yet"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={POST_STATUS_TONE[post.status]}>{STATUS_LABELS[post.status]}</Chip>
            {can.edit &&
              nextStatuses.map((status) => (
                <ActionButton
                  key={status}
                  action={setPostStatusAction}
                  fields={{ slug, postId, status }}
                  pendingText="Saving..."
                  className={buttonSecondarySm}
                >
                  {status === "draft"
                    ? post.status === "archived"
                      ? "Restore"
                      : "Back to draft"
                    : "Waiting on design"}
                </ActionButton>
              ))}
            {can.edit && (
              <ActionButton
                action={duplicatePostAction}
                fields={{ slug, postId }}
                pendingText="Copying..."
                className={buttonSecondarySm}
              >
                Duplicate
              </ActionButton>
            )}
            {can.edit && !published && post.status !== "archived" && (
              <ActionButton
                action={setPostStatusAction}
                fields={{ slug, postId, status: "archived" }}
                pendingText="Archiving..."
                className={buttonSecondarySm}
              >
                Archive
              </ActionButton>
            )}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-6">
          <Card
            step={1}
            title="Where to post"
            description={
              selected.length === 0
                ? "Pick one or more. Connected accounts post on their own at the scheduled time."
                : `${selected.length} picked${automaticCount > 0 ? ` · ${automaticCount} will post automatically` : ""}. Connect more on the Accounts tab.`
            }
          >
            <PlatformPicker slug={slug} postId={postId} options={options} readOnly={!can.edit || published} />
          </Card>

          <Card
            step={2}
            title="Image or video"
            description={
              needsMedia
                ? "Instagram only accepts posts with an image or video."
                : "Optional, but posts with an image get far more attention."
            }
          >
            <MediaUploader
              slug={slug}
              postId={postId}
              storage={upload.storage}
              prefix={upload.prefix}
              media={media}
              readOnly={!can.edit || published}
            />
          </Card>

          <Card step={3} title="Caption" description="Written once, used on every platform you picked. Change one platform below if it needs different wording.">
            <PostForm
              slug={slug}
              postId={postId}
              readOnly={!can.edit || published}
              offerings={offerings}
              platforms={selected}
              values={{
                title: post.title,
                category: post.category,
                plannedDate: post.plannedDate ?? "",
                caption: post.caption ?? "",
                hashtags: post.hashtags.join(" "),
                creativeBrief: post.creativeBrief ?? "",
                imagePrompt: post.imagePrompt ?? "",
                notes: post.notes ?? "",
                offeringId: post.offeringId ?? "",
              }}
            />
          </Card>

          {post.variants.length > 0 && (
            <section className="grid gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">Different wording for one platform?</h2>
                <p className="text-sm text-muted">
                  Open a platform to change its caption, add a link or a first comment. Anything you change here stays
                  when the shared caption is edited.
                </p>
              </div>
              {post.variants.map((variant) => {
                const locked = published || variant.status === "published" || variant.status === "queued";
                const blocker = variant.issues.find((issue) => issue.level === "blocker");
                return (
                  <details
                    key={variant.platform}
                    className="group rounded-xl border border-line bg-surface [&_summary::-webkit-details-marker]:hidden"
                  >
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{SOCIAL_PLATFORM_LABEL[variant.platform]}</span>
                        <Chip tone={VARIANT_STATUS_TONE[variant.status]}>{VARIANT_STATUS_LABEL[variant.status]}</Chip>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        {blocker ? <span className="text-crit">{blocker.message}</span> : "Edit"}
                        <span aria-hidden className="transition-transform group-open:rotate-180">
                          ▾
                        </span>
                      </span>
                    </summary>
                    <div className="border-t border-line px-5 py-4">
                      <VariantForm
                        slug={slug}
                        postId={postId}
                        platform={variant.platform}
                        readOnly={!can.edit || locked}
                        values={{
                          caption: variant.caption,
                          title: variant.title ?? "",
                          linkUrl: variant.linkUrl ?? "",
                          firstComment: variant.firstComment ?? "",
                          hashtags: variant.hashtags.join(" "),
                          hasMedia: variant.hasMedia || media.length > 0,
                          exists: true,
                        }}
                      />
                    </div>
                  </details>
                );
              })}
            </section>
          )}
        </div>

        <aside className="grid gap-6 lg:sticky lg:top-6">
          {can.schedule && !published && (
            <ScheduleForm
              slug={slug}
              postId={postId}
              timezone={client.timezone}
              defaultDate={post.plannedDate && post.plannedDate >= today ? post.plannedDate : today}
              defaultTime={post.scheduledAt ? timeIn(client.timezone, post.scheduledAt) : "09:30"}
              scheduledFor={
                post.scheduledAt
                  ? new Intl.DateTimeFormat("en-IN", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: client.timezone,
                    }).format(post.scheduledAt)
                  : null
              }
              checklist={checklist}
              blockers={blockers}
            />
          )}

          <PublishingPanel
            slug={slug}
            postId={postId}
            postStatus={post.status}
            variants={post.variants}
            accounts={accounts}
            timezone={client.timezone}
            canPublish={can.publish}
            media={media}
          />

          <PostPreview name={previewAccount} caption={post.caption ?? ""} hashtags={post.hashtags} media={media} />

          {post.scheduledAt && published && (
            <p className="text-sm text-muted">
              Went out {todayIn(client.timezone, post.publishedAt ?? post.scheduledAt)}.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
