"use client";

import { CATEGORY_LABELS, type MixRow } from "@sp/core";
import { useActionState, useState } from "react";
import { buttonSecondarySm, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { saveMixAction } from "./actions";

export function MixForm({ slug, mix }: { slug: string; mix: MixRow[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMixAction, undefined);
  const [targets, setTargets] = useState(() =>
    Object.fromEntries(mix.map((row) => [row.category, row.target])) as Record<string, number>,
  );

  const total = Object.values(targets).reduce((sum, value) => sum + (Number(value) || 0), 0);

  return (
    <details className="border-t border-line pt-3">
      <summary className="cursor-pointer text-sm font-medium">Change the targets</summary>
      <form action={action} className="mt-3 grid gap-2">
        <input type="hidden" name="slug" value={slug} />
        {mix.map((row) => (
          <div key={row.category} className="flex items-center justify-between gap-3">
            <label htmlFor={`mix-${row.category}`} className="text-sm">
              {CATEGORY_LABELS[row.category]}
            </label>
            <div className="flex items-center gap-1">
              <input
                id={`mix-${row.category}`}
                name={row.category}
                type="number"
                min={0}
                max={100}
                value={targets[row.category] ?? 0}
                onChange={(event) =>
                  setTargets((current) => ({ ...current, [row.category]: Number(event.target.value) }))
                }
                className={`${inputClass} w-20 text-right tabular-nums`}
              />
              <span className="text-sm text-muted">%</span>
            </div>
          </div>
        ))}

        <p className={`text-sm ${total === 100 ? "text-muted" : "text-crit"}`}>
          {total === 100 ? "Adds up to 100 percent." : `Adds up to ${total} percent. It needs to make 100.`}
        </p>

        <button type="submit" className={buttonSecondarySm} disabled={pending || total !== 100}>
          {pending ? "Saving..." : "Save targets"}
        </button>

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
    </details>
  );
}
