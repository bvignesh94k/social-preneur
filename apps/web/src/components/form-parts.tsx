import type { ReactNode } from "react";
import type { FormState } from "@/lib/form-state";

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-crit">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="font-display text-base font-bold">{title}</h3>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function FormStatus({ state, idleText }: { state: FormState; idleText?: string | null }) {
  if (state?.message) {
    return (
      <p role="alert" className="text-sm text-crit">
        {state.message}
      </p>
    );
  }
  if (state?.errors && Object.keys(state.errors).length > 0) {
    return (
      <p role="alert" className="text-sm text-crit">
        Check the highlighted fields.
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="text-sm text-accent">
        Saved.
      </p>
    );
  }
  return idleText ? <p className="text-sm text-muted">{idleText}</p> : null;
}
