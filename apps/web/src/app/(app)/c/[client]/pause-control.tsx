"use client";

import { useActionState, useState } from "react";
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/ui";
import { setPublishingPausedAction } from "./actions";

export function PauseControl({ clientId, clientName, paused }: { clientId: string; clientName: string; paused: boolean }) {
  const [state, action, pending] = useActionState(setPublishingPausedAction, undefined);
  const [confirming, setConfirming] = useState(false);

  const error = state?.error && (
    <p role="alert" className="text-sm text-crit">
      {state.error}
    </p>
  );

  if (paused) {
    return (
      <form action={action} className="grid gap-2">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="paused" value="false" />
        <button type="submit" className={`${buttonPrimary} justify-self-start`} disabled={pending}>
          {pending ? "Resuming..." : "Resume publishing"}
        </button>
        {error}
      </form>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className={`${buttonSecondary} justify-self-start`} onClick={() => setConfirming(true)}>
        Pause publishing
      </button>
    );
  }

  return (
    <form action={action} className="grid gap-3 rounded-md border border-crit/40 bg-crit-soft p-3">
      <p className="text-sm">
        Pause all publishing for <strong>{clientName}</strong>? Scheduled posts will wait until someone resumes.
      </p>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="paused" value="true" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonDanger} disabled={pending}>
          {pending ? "Pausing..." : "Pause publishing"}
        </button>
        <button type="button" className={buttonSecondary} onClick={() => setConfirming(false)}>
          Keep publishing
        </button>
      </div>
      {error}
    </form>
  );
}
