"use client";

import { FACT_KINDS, type FactKind } from "@sp/core";
import { useActionState } from "react";
import { Field, FormStatus } from "@/components/form-parts";
import { buttonPrimary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { FACT_KIND_LABEL } from "@/lib/labels";
import { saveFactAction } from "../actions";

export interface FactDto {
  id: string;
  kind: FactKind;
  statement: string;
  sourceRef: string | null;
  offeringId: string | null;
  status: "unverified" | "verified" | "rejected";
  canEdit: boolean;
}

export interface OfferingOption {
  id: string;
  name: string;
  kind: "product" | "service";
}

export function FactForm({
  clientId,
  slug,
  offerings,
  canVerify,
  fact,
}: {
  clientId: string;
  slug: string;
  offerings: OfferingOption[];
  canVerify: boolean;
  fact?: FactDto;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFactAction, undefined);
  const v = state?.values;
  const errors = state?.errors ?? {};
  const id = (name: string) => `${fact?.id ?? "new"}-${name}`;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      {fact && <input type="hidden" name="factId" value={fact.id} />}

      <div className="grid gap-4 md:grid-cols-2">
        <Field id={id("kind")} label="Type of fact" error={errors.kind}>
          <select
            id={id("kind")}
            name="kind"
            defaultValue={v?.kind ?? fact?.kind ?? "certification"}
            className={inputClass}
          >
            {FACT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FACT_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("offeringId")} label="About" optional>
          <select
            id={id("offeringId")}
            name="offeringId"
            defaultValue={v?.offeringId ?? fact?.offeringId ?? ""}
            className={inputClass}
          >
            <option value="">The whole business</option>
            {offerings.map((offering) => (
              <option key={offering.id} value={offering.id}>
                {offering.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        id={id("statement")}
        label="Fact"
        hint='Write it exactly as it may appear in a post, for example "ISO 9001:2015 certified since 2018".'
        error={errors.statement}
      >
        <textarea
          id={id("statement")}
          name="statement"
          rows={2}
          required
          defaultValue={v?.statement ?? fact?.statement ?? ""}
          className={inputClass}
        />
      </Field>

      <Field
        id={id("sourceRef")}
        label="Source"
        hint="Where someone can check it: certificate number, web page or document name."
        error={errors.sourceRef}
        optional
      >
        <input
          id={id("sourceRef")}
          name="sourceRef"
          defaultValue={v?.sourceRef ?? fact?.sourceRef ?? ""}
          className={inputClass}
        />
      </Field>

      {canVerify && !fact && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="markVerified" className="accent-[var(--accent)]" />
          I have checked this fact against its source
        </label>
      )}
      {fact?.status === "verified" && (
        <p className="text-xs text-warn">Changing what this fact says sends it back to Needs review.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonPrimary} disabled={pending}>
          {pending ? "Saving..." : fact ? "Save changes" : "Add fact"}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
