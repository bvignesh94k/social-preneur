"use client";

import {
  PLATFORM_RULES,
  checkVariant,
  countPlatformCharacters,
  parseHashtags,
  type SocialPlatform,
} from "@sp/core";
import { useActionState, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/form-parts";
import { buttonPrimarySm, buttonSecondarySm, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import { removeVariantAction, saveVariantAction } from "../actions";

export interface VariantValues {
  caption: string;
  title: string;
  linkUrl: string;
  firstComment: string;
  hashtags: string;
  hasMedia: boolean;
  exists: boolean;
}

export function VariantForm({
  slug,
  postId,
  platform,
  values,
  readOnly,
}: {
  slug: string;
  postId: string;
  platform: SocialPlatform;
  values: VariantValues;
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveVariantAction, undefined);
  const rules = PLATFORM_RULES[platform];

  const [caption, setCaption] = useState(values.caption);
  const [hashtags, setHashtags] = useState(values.hashtags);
  const [title, setTitle] = useState(values.title);
  const [linkUrl, setLinkUrl] = useState(values.linkUrl);
  const [hasMedia, setHasMedia] = useState(values.hasMedia);

  const used = countPlatformCharacters(platform, caption);
  const over = used > rules.captionLimit;

  // The same check the server will run, so the warnings appear while typing.
  const live = checkVariant(platform, {
    caption,
    title,
    linkUrl,
    hashtags: parseHashtags(hashtags),
    hasMedia,
  });

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <form action={action} className="grid gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="platform" value={platform} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold">{SOCIAL_PLATFORM_LABEL[platform]}</h3>
        <span className={`font-mono text-xs tabular-nums ${over ? "text-crit" : "text-muted"}`}>
          {used} / {rules.captionLimit}
        </span>
      </div>

      <Field id={`${platform}-caption`} label="Caption">
        <textarea
          id={`${platform}-caption`}
          name="caption"
          rows={platform === "x" || platform === "threads" ? 3 : 6}
          disabled={readOnly}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          className={inputClass}
        />
      </Field>

      {rules.titleLimit !== null && (
        <Field id={`${platform}-title`} label="Title" optional hint={`Up to ${rules.titleLimit} characters.`}>
          <input
            id={`${platform}-title`}
            name="title"
            maxLength={rules.titleLimit}
            disabled={readOnly}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClass}
          />
        </Field>
      )}

      <Field
        id={`${platform}-hashtags`}
        label="Hashtags"
        optional
        hint={`${rules.hashtagsAdvised} or fewer usually perform best here.`}
      >
        <input
          id={`${platform}-hashtags`}
          name="hashtags"
          disabled={readOnly}
          value={hashtags}
          onChange={(event) => setHashtags(event.target.value)}
          placeholder="packaging labels"
          className={inputClass}
        />
      </Field>

      <Field id={`${platform}-link`} label="Link" optional>
        <input
          id={`${platform}-link`}
          name="linkUrl"
          type="url"
          disabled={readOnly}
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          placeholder="https://"
          className={inputClass}
        />
      </Field>

      {rules.supportsFirstComment && (
        <Field id={`${platform}-first-comment`} label="First comment" optional>
          <textarea
            id={`${platform}-first-comment`}
            name="firstComment"
            rows={2}
            disabled={readOnly}
            defaultValue={values.firstComment}
            className={inputClass}
          />
        </Field>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="hasMedia"
          disabled={readOnly}
          checked={hasMedia}
          onChange={(event) => setHasMedia(event.target.checked)}
          className="size-4 rounded border-line"
        />
        An image or video is ready for this post
      </label>

      {live.length > 0 && (
        <ul className="grid gap-1">
          {live.map((issue) => (
            <li
              key={issue.message}
              className={`rounded px-2 py-1 text-xs ${
                issue.level === "blocker" ? "bg-crit-soft text-crit" : "bg-warn-soft text-warn"
              }`}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <button type="submit" className={buttonPrimarySm + " justify-self-start"} disabled={pending}>
          {pending ? "Saving..." : values.exists ? "Save version" : "Add version"}
        </button>
      )}

      {state?.message && (
        <p role="alert" className="text-sm text-crit">
          {state.message}
        </p>
      )}
      {state?.ok && (
          <p role="status" className="text-sm text-accent">
            Saved.
          </p>
        )}
      </form>

      {values.exists && !readOnly && (
        <ActionButton
          action={removeVariantAction}
          fields={{ slug, postId, platform }}
          pendingText="Removing..."
          className={buttonSecondarySm}
        >
          Remove this version
        </ActionButton>
      )}
    </div>
  );
}
