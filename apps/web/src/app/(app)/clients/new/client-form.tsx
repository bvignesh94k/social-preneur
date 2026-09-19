"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";
import { createClientAction } from "../actions";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-crit">
      {message}
    </p>
  );
}

export function ClientForm() {
  const [state, action, pending] = useActionState(createClientAction, undefined);
  const errors = state?.errors ?? {};
  const values = state?.values;

  return (
    <form action={action} className="grid gap-5 rounded-lg border border-line bg-surface p-6" noValidate>
      {state?.message && (
        <p role="alert" className="rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">
          {state.message}
        </p>
      )}

      <div className="grid gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Client name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={values?.name}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
          placeholder="Client business name"
          className={inputClass}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="website" className="text-sm font-medium">
          Website <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="website"
          name="website"
          type="url"
          inputMode="url"
          defaultValue={values?.website}
          aria-invalid={Boolean(errors.website)}
          aria-describedby={errors.website ? "website-error" : "website-hint"}
          placeholder="https://example.com"
          className={inputClass}
        />
        <p id="website-hint" className="text-xs text-muted">
          Used later to analyse the client&apos;s services and products.
        </p>
        <FieldError id="website-error" message={errors.website} />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="industry" className="text-sm font-medium">
          Industry <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="industry"
          name="industry"
          defaultValue={values?.industry}
          aria-invalid={Boolean(errors.industry)}
          aria-describedby={errors.industry ? "industry-error" : undefined}
          placeholder="Manufacturing"
          className={inputClass}
        />
        <FieldError id="industry-error" message={errors.industry} />
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Content language</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["en", "English"],
              ["ta", "Tamil"],
              ["en_ta", "English and Tamil"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name="defaultLanguage"
                value={value}
                defaultChecked={(values?.defaultLanguage ?? "en") === value}
                className="accent-[var(--accent)]"
              />
              {label}
            </label>
          ))}
        </div>
        <FieldError id="language-error" message={errors.defaultLanguage} />
      </fieldset>

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" className={buttonPrimary} disabled={pending}>
          {pending ? "Adding client..." : "Add client"}
        </button>
        <Link href="/clients" className={buttonSecondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
