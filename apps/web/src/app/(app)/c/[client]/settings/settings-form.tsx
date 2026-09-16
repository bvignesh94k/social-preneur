"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, FormSection, FormStatus } from "@/components/form-parts";
import { buttonPrimary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { updateClientSettingsAction } from "./actions";

export interface ClientSettingsValues {
  name: string;
  website: string;
  industry: string;
  timezone: string;
}

// Grouped by region so the client's customers can be found by where they are,
// not by memorising an IANA identifier.
function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// Intl.supportedValuesOf("timeZone") is not the full picture: different ICU
// builds disagree on which identifier is "canonical" for a given zone, so a
// real, correctly resolving name like Asia/Kolkata can be missing from it
// while a formatter still accepts and resolves it correctly. This always
// includes the app's own default and whatever the client is already set to,
// so the dropdown never silently mismatches what is actually stored.
function timeZoneOptions(currentValue: string): { region: string; zones: string[] }[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }

  const zoneSet = new Set(zones);
  for (const zone of ["Asia/Kolkata", currentValue]) {
    if (zone && isValidTimeZone(zone)) zoneSet.add(zone);
  }

  const groups = new Map<string, string[]>();
  for (const zone of zoneSet) {
    const region = zone.split("/")[0] ?? "Other";
    const list = groups.get(region) ?? [];
    list.push(zone);
    groups.set(region, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, list]) => ({ region, zones: list.sort() }));
}

function currentOffset(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(
      new Date(),
    );
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

export function SettingsForm({ slug, values }: { slug: string; values: ClientSettingsValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateClientSettingsAction, undefined);
  const [timezone, setTimezone] = useState(values.timezone);
  const groups = useMemo(() => timeZoneOptions(values.timezone), [values.timezone]);
  const initial = { ...values, ...state?.values };

  return (
    <form action={action} className="grid gap-6 rounded-lg border border-line bg-surface p-5">
      <input type="hidden" name="slug" value={slug} />

      <FormSection title="Client details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="settings-name" label="Client name" error={state?.errors?.name}>
            <input id="settings-name" name="name" required maxLength={120} defaultValue={initial.name} className={inputClass} />
          </Field>

          <Field id="settings-website" label="Website" optional>
            <input
              id="settings-website"
              name="website"
              type="url"
              defaultValue={initial.website}
              placeholder="https://"
              className={inputClass}
            />
          </Field>

          <Field id="settings-industry" label="Industry" optional>
            <input id="settings-industry" name="industry" maxLength={80} defaultValue={initial.industry} className={inputClass} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Timezone"
        description="Every scheduled post fires at the wall clock time chosen here, in this client's own timezone. Set it to where this client's customers are, which is often not where your agency is."
      >
        <Field
          id="settings-timezone"
          label="Client timezone"
          hint={timezone ? `Current time there: ${currentOffset(timezone)}` : undefined}
        >
          <select
            id="settings-timezone"
            name="timezone"
            required
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={inputClass}
          >
            {groups.map((group) => (
              <optgroup key={group.region} label={group.region}>
                {group.zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonPrimary} disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </button>
        <FormStatus state={state} idleText={null} />
      </div>
    </form>
  );
}
