"use client";

import { CATEGORY_LABELS, CONTENT_CATEGORIES } from "@sp/core";
import { useActionState } from "react";
import { Field, FormSection, FormStatus } from "@/components/form-parts";
import { buttonPrimary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
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
  readOnly,
}: {
  slug: string;
  postId: string;
  values: PostFormValues;
  offerings: { id: string; name: string; kind: string }[];
  readOnly: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePostAction, undefined);
  const initial = { ...values, ...state?.values };

  return (
    <form action={action} className="grid gap-6 rounded-lg border border-line bg-surface p-5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="postId" value={postId} />

      <FormSection title="The post" description="The master version. Platform versions come from this.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="post-title" label="Working title">
            <input
              id="post-title"
              name="title"
              required
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

          <Field id="post-date" label="Planned day" optional>
            <input
              id="post-date"
              name="plannedDate"
              type="date"
              disabled={readOnly}
              defaultValue={initial.plannedDate}
              className={inputClass}
            />
          </Field>

          <Field id="post-offering" label="Product or service" optional hint="Used to keep the claims accurate.">
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
        </div>

        <Field id="post-caption" label="Caption" optional hint="The base wording, before each platform's version.">
          <textarea
            id="post-caption"
            name="caption"
            rows={6}
            disabled={readOnly}
            defaultValue={initial.caption}
            className={inputClass}
          />
        </Field>

        <Field id="post-hashtags" label="Hashtags" optional>
          <input
            id="post-hashtags"
            name="hashtags"
            disabled={readOnly}
            defaultValue={initial.hashtags}
            placeholder="packaging labels coldchain"
            className={inputClass}
          />
        </Field>
      </FormSection>

      <FormSection title="Creative" description="What the designer or the image tool needs.">
        <Field id="post-brief" label="Creative brief" optional>
          <textarea
            id="post-brief"
            name="creativeBrief"
            rows={3}
            disabled={readOnly}
            defaultValue={initial.creativeBrief}
            placeholder="A freezer shelf with frost on the cartons, label clearly readable"
            className={inputClass}
          />
        </Field>

        <Field id="post-image-prompt" label="Image prompt" optional>
          <textarea
            id="post-image-prompt"
            name="imagePrompt"
            rows={2}
            disabled={readOnly}
            defaultValue={initial.imagePrompt}
            className={inputClass}
          />
        </Field>

        <Field id="post-notes" label="Notes" optional hint="Anything you want to remember about this post.">
          <textarea
            id="post-notes"
            name="notes"
            rows={2}
            disabled={readOnly}
            defaultValue={initial.notes}
            className={inputClass}
          />
        </Field>
      </FormSection>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonPrimary} disabled={pending}>
            {pending ? "Saving..." : "Save post"}
          </button>
          <FormStatus state={state} />
        </div>
      )}
    </form>
  );
}
