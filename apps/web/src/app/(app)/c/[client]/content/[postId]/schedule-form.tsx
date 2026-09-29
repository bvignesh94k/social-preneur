"use client";

import { useActionState } from "react";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/form-parts";
import { buttonPrimary, buttonSecondarySm, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { schedulePostAction, unschedulePostAction } from "../actions";

export interface ReadinessItem {
  label: string;
  done: boolean;
}

export function ScheduleForm({
  slug,
  postId,
  timezone,
  defaultDate,
  defaultTime,
  scheduledFor,
  checklist,
  blockers,
}: {
  slug: string;
  postId: string;
  timezone: string;
  defaultDate: string;
  defaultTime: string;
  scheduledFor: string | null;
  checklist: ReadinessItem[];
  blockers: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(schedulePostAction, undefined);
  const zone = timezone.replace("_", " ");

  return (
    <section className="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div>
        <h2 className="font-display text-lg font-bold">When to post</h2>
        <p className="text-sm text-muted">{zone} time, the client&apos;s own timezone.</p>
      </div>

      {scheduledFor && (
        <div className="grid gap-2 rounded-lg bg-accent-soft px-3 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-accent-ink">Scheduled</p>
          <p className="font-display text-base font-bold text-accent-ink">{scheduledFor}</p>
          <ActionButton
            action={unschedulePostAction}
            fields={{ slug, postId }}
            pendingText="Removing..."
            className={buttonSecondarySm}
          >
            Unschedule
          </ActionButton>
        </div>
      )}

      <ul className="grid gap-1.5">
        {checklist.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                item.done ? "bg-accent text-surface" : "border border-line text-transparent"
              }`}
            >
              ✓
            </span>
            <span className={item.done ? "" : "text-muted"}>
              {item.label}
              <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
            </span>
          </li>
        ))}
      </ul>

      {blockers.length > 0 && (
        <div className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          <p className="font-medium">Fix before it goes out</p>
          <ul className="mt-1 grid gap-0.5">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}

      <form action={action} className="grid gap-3">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="postId" value={postId} />

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <button type="submit" className={`${buttonPrimary} w-full py-2.5`} disabled={pending}>
          {pending ? "Saving..." : scheduledFor ? "Change time" : "Schedule post"}
        </button>
      </form>

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
