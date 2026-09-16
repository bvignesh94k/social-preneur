"use client";

import { useActionState } from "react";
import { signInAction } from "@/app/actions/auth";
import { buttonPrimary, inputClass } from "@/components/ui";

export function SignInForm() {
  const [state, action, pending] = useActionState(signInAction, undefined);

  return (
    <form action={action} className="mt-6 grid gap-4">
      {state?.error && (
        <p role="alert" className="rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">
          {state.error}
        </p>
      )}
      <div className="grid gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.email}
          className={inputClass}
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <button type="submit" className={`${buttonPrimary} mt-1 w-full`} disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
