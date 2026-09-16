"use client";

import { useActionState } from "react";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/form-parts";
import { buttonPrimarySm, buttonSecondarySm, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { schedulePostAction, unschedulePostAction } from "../actions";

export function ScheduleForm({
  slug,
  postId,
  timezone,
  defaultDate,
  defaultTime,
  scheduledFor,
  blockers,
}: {
  slug: string;
  postId: string;
  timezone: string;
  defaultDate: string;
  defaultTime: string;
  scheduledFor: string | null;
  blockers: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(schedulePostAction, undefined);

  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-base font-bold">Publishing</h2>
        <p className="text-sm text-muted">
          {scheduledFor
            ? `Scheduled for ${scheduledFor}, ${timezone.replace("_", " ")} time.`
            : `Times are ${timezone.replace("_", " ")} time, the client's own timezone.`}
        </p>
      </div>

      {blockers.length > 0 && (
        <div className="rounded bg-warn-soft px-3 py-2 text-xs text-warn">
          <p className="font-medium">Not ready to publish yet</p>
          <ul className="mt-1 grid gap-0.5">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}

      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="postId" value={postId} />

        <Field id="schedule-date" label="Day">
          <input
            id="schedule-date"
            name="plannedDate"
            type="date"
            required
            defaultValue={state?.values?.plannedDate ?? defaultDate}
            className={inputClass}
          />
        </Field>

        <Field id="schedule-time" label="Time">
          <input
            id="schedule-time"
            name="time"
            type="time"
            required
            defaultValue={state?.values?.time ?? defaultTime}
            className={inputClass}
          />
        </Field>

        <button type="submit" className={buttonPrimarySm} disabled={pending}>
          {pending ? "Saving..." : scheduledFor ? "Change time" : "Schedule"}
        </button>
      </form>

      {scheduledFor && (
        <ActionButton
          action={unschedulePostAction}
          fields={{ slug, postId }}
          pendingText="Removing..."
          className={buttonSecondarySm}
        >
          Unschedule
        </ActionButton>
      )}

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
    </section>
  );
}
