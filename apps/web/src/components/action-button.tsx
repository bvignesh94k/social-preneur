"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/lib/form-state";

export function ActionButton({
  action,
  fields,
  children,
  pendingText,
  className,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  children: ReactNode;
  pendingText: string;
  className: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {pending ? pendingText : children}
      </button>
      {state?.message && (
        <span role="alert" className="text-xs text-crit">
          {state.message}
        </span>
      )}
    </form>
  );
}
