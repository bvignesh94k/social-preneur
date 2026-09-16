"use client";

import { useActionState } from "react";
import { Field } from "@/components/form-parts";
import { buttonPrimary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { setupAction } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(setupAction, undefined);
  const errors = state?.errors ?? {};
  const values = state?.values;

  return (
    <form action={action} className="mt-6 grid gap-4">
      {state?.message && (
        <p role="alert" className="rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">
          {state.message}
        </p>
      )}

      <Field id="token" label="Setup token" hint="The SETUP_TOKEN value from your hosting settings." error={errors.token}>
        <input id="token" name="token" type="password" autoComplete="off" required className={inputClass} />
      </Field>

      <Field id="agencyName" label="Agency name" error={errors.agencyName}>
        <input
          id="agencyName"
          name="agencyName"
          required
          defaultValue={values?.agencyName ?? "VTurnU Digital Solutions LLP"}
          className={inputClass}
        />
      </Field>

      <Field id="name" label="Your name" error={errors.name}>
        <input id="name" name="name" autoComplete="name" required defaultValue={values?.name} className={inputClass} />
      </Field>

      <Field id="email" label="Your email" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={values?.email}
          className={inputClass}
        />
      </Field>

      <Field id="password" label="Password" hint="At least 12 characters." error={errors.password}>
        <input id="password" name="password" type="password" autoComplete="new-password" required className={inputClass} />
      </Field>

      <Field id="confirm" label="Confirm password" error={errors.confirm}>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
      </Field>

      <button type="submit" className={`${buttonPrimary} mt-1 w-full`} disabled={pending}>
        {pending ? "Creating your agency..." : "Create agency and admin account"}
      </button>
    </form>
  );
}
