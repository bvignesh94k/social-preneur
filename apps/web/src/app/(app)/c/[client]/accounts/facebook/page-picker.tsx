"use client";

import { useActionState } from "react";
import { buttonPrimarySm } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { chooseFacebookPageAction } from "../actions";

export interface PickablePage {
  id: string;
  name: string;
  canPost: boolean;
  inUseElsewhere: boolean;
}

export function FacebookPagePicker({ slug, pages }: { slug: string; pages: PickablePage[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(chooseFacebookPageAction, undefined);

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="slug" value={slug} />
      <fieldset className="grid gap-2">
        <legend className="sr-only">Facebook Pages you manage</legend>
        {pages.map((page) => (
          <label
            key={page.id}
            className={`flex items-start gap-3 rounded-md border border-line bg-surface p-3 ${
              page.canPost ? "cursor-pointer hover:bg-sunk" : "opacity-60"
            }`}
          >
            <input
              type="radio"
              name="pageId"
              value={page.id}
              required
              disabled={!page.canPost}
              className="mt-1 size-4"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{page.name}</span>
              {!page.canPost && (
                <span className="text-xs text-muted">Your login cannot create posts on this Page.</span>
              )}
              {page.inUseElsewhere && (
                <span className="text-xs text-warn">Already connected to another client.</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={pending} className={`${buttonPrimarySm} justify-self-start`}>
        {pending ? "Connecting..." : "Connect this Page"}
      </button>
      {state?.message && (
        <p role="alert" className="text-sm text-crit">
          {state.message}
        </p>
      )}
    </form>
  );
}
