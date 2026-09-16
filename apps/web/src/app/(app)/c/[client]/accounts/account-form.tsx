"use client";

import type { SocialPlatform } from "@sp/core";
import { useActionState } from "react";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/form-parts";
import { buttonPrimarySm, buttonSecondarySm, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { addSocialAccountAction, removeSocialAccountAction, updateSocialAccountAction } from "./actions";

export interface ExistingAccount {
  id: string;
  displayName: string;
  handle: string;
  profileUrl: string;
}

export function AccountEditForm({
  slug,
  platform,
  account,
}: {
  slug: string;
  platform: SocialPlatform;
  account: ExistingAccount;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateSocialAccountAction, undefined);
  const values = { ...account, ...state?.values };

  return (
    <div className="grid gap-3">
      <form action={action} className="grid gap-3">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="platform" value={platform} />
        <input type="hidden" name="accountId" value={account.id} />

        <Field id={`${platform}-name`} label="Page or profile name">
          <input
            id={`${platform}-name`}
            name="displayName"
            required
            defaultValue={values.displayName}
            className={inputClass}
          />
        </Field>

        <Field id={`${platform}-handle`} label="Handle" optional>
          <input
            id={`${platform}-handle`}
            name="handle"
            defaultValue={values.handle}
            placeholder="username"
            className={inputClass}
          />
        </Field>

        <Field id={`${platform}-url`} label="Profile link" optional>
          <input
            id={`${platform}-url`}
            name="profileUrl"
            type="url"
            defaultValue={values.profileUrl}
            placeholder="https://"
            className={inputClass}
          />
        </Field>

        <button type="submit" className={`${buttonPrimarySm} justify-self-start`} disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </button>

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
      </form>

      <ActionButton
        action={removeSocialAccountAction}
        fields={{ slug, platform, accountId: account.id }}
        pendingText="Removing..."
        className={`${buttonSecondarySm} justify-self-start`}
      >
        Remove this account
      </ActionButton>
    </div>
  );
}

export function AccountAddForm({ slug, platform }: { slug: string; platform: SocialPlatform }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addSocialAccountAction, undefined);

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="platform" value={platform} />

      <Field id={`${platform}-add-name`} label="Page or profile name" hint="What you see when you log in to it.">
        <input
          id={`${platform}-add-name`}
          name="displayName"
          required
          defaultValue={state?.values?.displayName}
          placeholder="Kaveri Industrial Labels"
          className={inputClass}
        />
      </Field>

      <Field id={`${platform}-add-handle`} label="Handle" optional>
        <input
          id={`${platform}-add-handle`}
          name="handle"
          defaultValue={state?.values?.handle}
          placeholder="username"
          className={inputClass}
        />
      </Field>

      <Field id={`${platform}-add-url`} label="Profile link" optional>
        <input
          id={`${platform}-add-url`}
          name="profileUrl"
          type="url"
          defaultValue={state?.values?.profileUrl}
          placeholder="https://"
          className={inputClass}
        />
      </Field>

      <button type="submit" className={`${buttonPrimarySm} justify-self-start`} disabled={pending}>
        {pending ? "Adding..." : "Add account"}
      </button>

      {state?.message && (
        <p role="alert" className="text-sm text-crit">
          {state.message}
        </p>
      )}
    </form>
  );
}
