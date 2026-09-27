"use client";

import type { SocialPlatform } from "@sp/core";
import { useActionState } from "react";
import { buttonSecondarySm, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { markVariantPublishedAction } from "../actions";

export function MarkPostedForm({ slug, postId, platform }: { slug: string; postId: string; platform: SocialPlatform }) {
  const [state, action, pending] = useActionState<FormState, FormData>(markVariantPublishedAction, undefined);

  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="platform" value={platform} />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <label htmlFor={`${platform}-posted-url`} className="sr-only">
          Link to the published post (optional)
        </label>
        <input
          id={`${platform}-posted-url`}
          name="url"
          type="url"
          defaultValue={state?.values?.url}
          placeholder="Link to the post (optional)"
          className={inputClass}
        />
        <button type="submit" disabled={pending} className={`${buttonSecondarySm} justify-self-start`}>
          {pending ? "Saving..." : "Mark as posted"}
        </button>
      </div>
      {state?.message && (
        <p role="alert" className="text-xs text-crit">
          {state.message}
        </p>
      )}
    </form>
  );
}
