"use client";

import {
  CATEGORY_LABELS,
  CONTENT_CATEGORIES,
  PLATFORM_RULES,
  countPlatformCharacters,
  type SocialPlatform,
} from "@sp/core";
import { useActionState, useState } from "react";
import { Field, FormStatus } from "@/components/form-parts";
import { buttonPrimary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import { updatePostAction } from "../actions";

export interface PostFormValues {
  title: string;
  category: string;
  plannedDate: string;
  caption: string;
  hashtags: string;
  creativeBrief: string;
  imagePrompt: string;
  notes: string;
  offeringId: string;
}

export function PostForm({
  slug,
  postId,
  values,
  offerings,
  platforms,
  readOnly,
}: {
  slug: string;
  postId: string;
  values: PostFormValues;
  offerings: { id: string; name: string; kind: string }[];
  platforms: SocialPlatform[];
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePostAction, undefined);
  const initial = { ...values, ...state?.values };
  const [caption, setCaption] = useState(initial.caption);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="postId" value={postId} />

      <Field id="post-caption" label="Caption">
        <textarea
          id="post-caption"
          name="caption"
          rows={7}
          disabled={readOnly}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="What do you want to say? Write it once here and it goes to every platform you picked."
          className={inputClass}
        />
      </Field>

      {platforms.length > 0 && (
        <ul className="-mt-2 flex flex-wrap gap-1.5" aria-label="Characters used per platform">
          {platforms.map((platform) => {
            const used = countPlatformCharacters(platform, caption);
            const limit = PLATFORM_RULES[platform].captionLimit;
            const over = used > limit;
            return (
              <li
                key={platform}
                className={`rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums ${
                  over ? "bg-crit-soft text-crit" : "bg-sunk text-muted"
                }`}
              >
                {SOCIAL_PLATFORM_LABEL[platform]} {used}/{limit}
              </li>
            );
          })}
        </ul>
      )}

      <Field id="post-hashtags" label="Hashtags" optional hint="Separate with spaces. The # is added for you.">
        <input
          id="post-hashtags"
          name="hashtags"
          disabled={readOnly}
          defaultValue={initial.hashtags}
          placeholder="packaging labels coldchain"
          className={inputClass}
        />
      </Field>

      <details className="group rounded-lg border border-line bg-sunk/30 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
          <span>
            Post details
            <span className="font-normal text-muted"> · name, category, notes for the designer</span>
          </span>
          <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>

        <div className="grid gap-4 border-t border-line px-4 py-4 sm:grid-cols-2">
          <Field id="post-title" label="Post name" hint="Only your team sees this.">
            <input
              id="post-title"
              name="title"
              maxLength={200}
              disabled={readOnly}
              defaultValue={initial.title}
              className={inputClass}
            />
          </Field>

          <Field id="post-category" label="Category">
            <select
              id="post-category"
              name="category"
              disabled={readOnly}
              defaultValue={initial.category}
              className={inputClass}
            >
              {CONTENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </Field>

          <Field id="post-date" label="Planned day" optional hint="Where it sits on the calendar before it has a time.">
            <input
              id="post-date"
              name="plannedDate"
              type="date"
              disabled={readOnly}
              defaultValue={initial.plannedDate}
              className={inputClass}
            />
          </Field>

          <Field id="post-offering" label="Product or service" optional hint="Keeps the claims accurate.">
            <select
              id="post-offering"
              name="offeringId"
              disabled={readOnly}
              defaultValue={initial.offeringId}
              className={inputClass}
            >
              <option value="">Not about one in particular</option>
              {offerings.map((offering) => (
                <option key={offering.id} value={offering.id}>
                  {offering.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field id="post-brief" label="Brief for the designer" optional>
              <textarea
                id="post-brief"
                name="creativeBrief"
                rows={2}
                disabled={readOnly}
                defaultValue={initial.creativeBrief}
                placeholder="A freezer shelf with frost on the cartons, label clearly readable"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field id="post-image-prompt" label="Image prompt" optional hint="For an AI image tool.">
              <textarea
                id="post-image-prompt"
                name="imagePrompt"
                rows={2}
                disabled={readOnly}
                defaultValue={initial.imagePrompt}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field id="post-notes" label="Notes" optional>
              <textarea
                id="post-notes"
                name="notes"
                rows={2}
                disabled={readOnly}
                defaultValue={initial.notes}
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      </details>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonPrimary} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </button>
          <FormStatus state={state} />
        </div>
      )}
    </form>
  );
}
