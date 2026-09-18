import {
  CATEGORY_LABELS,
  SOCIAL_PLATFORMS,
  STATUS_LABELS,
  hasBlocker,
  timeIn,
  type SocialPlatform,
} from "@sp/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Chip, SectionHeader, buttonSecondarySm } from "@/components/ui";
import { getPostDetail } from "@/data/content";
import { POST_STATUS_TONE, SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import { duplicatePostAction, setPostStatusAction } from "../actions";
import { PostForm } from "./post-form";
import { ScheduleForm } from "./schedule-form";
import { VariantForm } from "./variant-form";

export const metadata: Metadata = { title: "Post" };

export default async function PostPage({ params }: PageProps<"/c/[client]/content/[postId]">) {
  const { client: slug, postId } = await params;
  const { client, can, post, offerings, today } = await getPostDetail(slug, postId);

  const variantFor = (platform: SocialPlatform) => post.variants.find((variant) => variant.platform === platform);

  // What stands between this post and being publishable.
  const blockers = post.variants
    .filter((variant) => hasBlocker(variant.issues))
    .map((variant) => `${SOCIAL_PLATFORM_LABEL[variant.platform]}: ${variant.issues[0]?.message ?? "not ready"}`);
  if (post.variants.length === 0) blockers.push("No platform version has been written yet.");

  const nextStatuses = {
    draft: ["needs_creative", "ready"],
    needs_creative: ["draft", "ready"],
    ready: ["draft"],
    scheduled: ["ready"],
    idea: ["draft"],
    failed: ["ready"],
    published: [],
    archived: ["draft"],
  }[post.status];

  return (
    <div className="grid gap-6">
      <SectionHeader
        title={post.title}
        description={
          <>
            {CATEGORY_LABELS[post.category]}
            {post.plannedDate ? ` · planned for ${post.plannedDate}` : " · no day chosen yet"}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={POST_STATUS_TONE[post.status]}>{STATUS_LABELS[post.status]}</Chip>
            <Link href={`/c/${slug}/content`} className={buttonSecondarySm}>
              Back to calendar
            </Link>
          </div>
        }
      />

      {can.edit && (
        <div className="flex flex-wrap items-center gap-2">
          {nextStatuses.map((status) => (
            <ActionButton
              key={status}
              action={setPostStatusAction}
              fields={{ slug, postId, status }}
              pendingText="Saving..."
              className={buttonSecondarySm}
            >
              {status === "ready"
                ? "Mark ready"
                : status === "draft"
                  ? "Back to draft"
                  : `Mark ${STATUS_LABELS[status as keyof typeof STATUS_LABELS].toLowerCase()}`}
            </ActionButton>
          ))}
          <ActionButton
            action={duplicatePostAction}
            fields={{ slug, postId }}
            pendingText="Copying..."
            className={buttonSecondarySm}
          >
            Duplicate
          </ActionButton>
          {post.status !== "published" && post.status !== "archived" && (
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
      )}

      <PostForm
        slug={slug}
        postId={postId}
        readOnly={!can.edit}
        offerings={offerings}
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

      {can.schedule && post.status !== "published" && (
        <ScheduleForm
          slug={slug}
          postId={postId}
          timezone={client.timezone}
          defaultDate={post.plannedDate ?? today}
          defaultTime={post.scheduledAt ? timeIn(client.timezone, post.scheduledAt) : "09:30"}
          scheduledFor={
            post.scheduledAt
              ? `${post.plannedDate ?? ""} at ${timeIn(client.timezone, post.scheduledAt)}`.trim()
              : null
          }
          blockers={blockers}
        />
      )}

      <section className="grid gap-4">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Platform versions</h2>
          <p className="mt-1 text-sm text-muted">
            Each platform counts characters differently and expects a different shape. A version is only marked
            ready when that platform would actually accept it.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {SOCIAL_PLATFORMS.map((platform) => {
            const variant = variantFor(platform);
            return (
              <VariantForm
                key={platform}
                slug={slug}
                postId={postId}
                platform={platform}
                readOnly={!can.edit}
                values={{
                  caption: variant?.caption ?? post.caption ?? "",
                  title: variant?.title ?? "",
                  linkUrl: variant?.linkUrl ?? "",
                  firstComment: variant?.firstComment ?? "",
                  hashtags: (variant?.hashtags ?? post.hashtags).join(" "),
                  hasMedia: variant?.hasMedia ?? false,
                  exists: variant !== undefined,
                }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
