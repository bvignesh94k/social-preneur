"use client";

import { useActionState } from "react";
import { Field, FormStatus } from "@/components/form-parts";
import { buttonPrimary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { saveOfferingAction } from "../actions";

export interface OfferingDto {
  id: string;
  kind: "product" | "service";
  name: string;
  summary: string | null;
  benefits: string[];
  audience: string | null;
  url: string | null;
  status: "active" | "archived";
}

export function OfferingForm({ clientId, slug, offering }: { clientId: string; slug: string; offering?: OfferingDto }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveOfferingAction, undefined);
  const v = state?.values;
  const errors = state?.errors ?? {};
  const prefix = offering?.id ?? "new";
  const id = (name: string) => `${prefix}-${name}`;
  const kind = v?.kind ?? offering?.kind ?? "product";

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      {offering && <input type="hidden" name="offeringId" value={offering.id} />}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div className="flex flex-wrap gap-2">
          {(["product", "service"] as const).map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name="kind"
                value={option}
                defaultChecked={kind === option}
                className="accent-[var(--accent)]"
              />
              {option === "product" ? "Product" : "Service"}
            </label>
          ))}
        </div>
      </fieldset>

      <Field id={id("name")} label="Name" error={errors.name}>
        <input
          id={id("name")}
          name="name"
          required
          defaultValue={v?.name ?? offering?.name ?? ""}
          placeholder="Thermal transfer labels"
          className={inputClass}
        />
      </Field>

      <Field id={id("summary")} label="Short description" error={errors.summary} optional>
        <textarea
          id={id("summary")}
          name="summary"
          rows={2}
          defaultValue={v?.summary ?? offering?.summary ?? ""}
          className={inputClass}
        />
      </Field>

      <Field id={id("benefits")} label="Key benefits" hint="One per line." optional>
        <textarea
          id={id("benefits")}
          name="benefits"
          rows={3}
          defaultValue={v?.benefits ?? offering?.benefits.join("\n") ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field id={id("audience")} label="Who it is for" error={errors.audience} optional>
          <input
            id={id("audience")}
            name="audience"
            defaultValue={v?.audience ?? offering?.audience ?? ""}
            placeholder="Warehouses and logistics firms"
            className={inputClass}
          />
        </Field>
        <Field id={id("url")} label="Page on the website" error={errors.url} optional>
          <input
            id={id("url")}
            name="url"
            type="url"
            inputMode="url"
            defaultValue={v?.url ?? offering?.url ?? ""}
            placeholder="https://"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonPrimary} disabled={pending}>
          {pending ? "Saving..." : offering ? "Save changes" : "Add"}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
