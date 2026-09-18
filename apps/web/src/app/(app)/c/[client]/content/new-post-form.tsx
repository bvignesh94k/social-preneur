"use client";

import { CATEGORY_LABELS, CONTENT_CATEGORIES } from "@sp/core";
import { useActionState } from "react";
import { Field } from "@/components/form-parts";
import { buttonPrimary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { createPostAction } from "./actions";

export function NewPostForm({ slug, defaultDate }: { slug: string; defaultDate: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createPostAction, undefined);

  return (
    <form action={action} className="grid gap-3 rounded-lg border border-line bg-surface p-5">
      <input type="hidden" name="slug" value={slug} />
      <div>
        <h2 className="font-display text-base font-bold">New post</h2>
        <p className="text-sm text-muted">Starts as a draft. You write the platform versions next.</p>
      </div>

      <Field id="new-title" label="Working title" hint="For you, not for the audience.">
        <input
          id="new-title"
          name="title"
          required
          maxLength={200}
          defaultValue={state?.values?.title ?? ""}
          placeholder="Cold storage label guide"
          className={inputClass}
        />
      </Field>

      <Field id="new-category" label="Category">
        <select
          id="new-category"
          name="category"
          defaultValue={state?.values?.category ?? "educational"}
          className={inputClass}
        >
          {CONTENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </Field>

      <Field id="new-date" label="Planned day" optional hint="You can place it on the calendar later.">
        <input
          id="new-date"
          name="plannedDate"
          type="date"
          defaultValue={state?.values?.plannedDate ?? defaultDate}
          className={inputClass}
        />
      </Field>

      <button type="submit" className={buttonPrimary} disabled={pending}>
        {pending ? "Adding..." : "Add post"}
      </button>

      {state?.message && (
        <p role="alert" className="text-sm text-crit">
          {state.message}
        </p>
      )}
    </form>
  );
}
