"use client";

import { useActionState } from "react";
import { Field } from "@/components/form-parts";
import { buttonPrimary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { startWebsiteScanAction } from "../ai-actions";

export function ScanForm({
  clientId,
  slug,
  defaultUrl,
  running,
}: {
  clientId: string;
  slug: string;
  defaultUrl: string;
  running: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(startWebsiteScanAction, undefined);

  return (
    <form action={action} className="grid gap-3 rounded-lg border border-line bg-surface p-5">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      <Field id="scan-url" label="Website address" error={state?.errors?.url}>
        <div className="flex flex-wrap gap-2">
          <input
            id="scan-url"
            name="url"
            type="url"
            inputMode="url"
            required
            disabled={running}
            defaultValue={state?.values?.url ?? defaultUrl}
            placeholder="https://"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button type="submit" className={buttonPrimary} disabled={pending || running}>
            {running ? "Scan running" : pending ? "Starting..." : "Scan website"}
          </button>
        </div>
      </Field>
      <p className="text-xs text-muted">
        Reads up to 15 public pages. Pages the website asks automated tools not to read are skipped.
      </p>
      {state?.message && (
        <p role="alert" className="text-sm text-crit">
          {state.message}
        </p>
      )}
    </form>
  );
}
