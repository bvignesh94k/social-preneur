"use client";

import { BRAND_RULE_TYPES, type BrandRuleType } from "@sp/core";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Field, FormStatus } from "@/components/form-parts";
import { buttonPrimary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { RULE_TYPE_LABEL } from "@/lib/labels";
import { createRuleAction } from "../actions";

function firstAvailable(usedTypes: string[]): BrandRuleType {
  return BRAND_RULE_TYPES.find((option) => !usedTypes.includes(option)) ?? "custom";
}

export function RuleForm({ clientId, slug, usedTypes }: { clientId: string; slug: string; usedTypes: string[] }) {
  const [fieldsKey, setFieldsKey] = useState(0);
  const [chosen, setChosen] = useState<BrandRuleType>(() => firstAvailable(usedTypes));
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await createRuleAction(prev, formData);
    if (result?.ok) setFieldsKey((key) => key + 1);
    return result;
  }, undefined);

  // A single-use rule that was just added can't be chosen again.
  const type = usedTypes.includes(chosen) ? firstAvailable(usedTypes) : chosen;
  const v = state?.ok ? undefined : state?.values;

  // Submitting manually skips React's automatic form reset, which would desync the controlled rule picker.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />

      <Field id="rule-type" label="Rule" error={state?.errors?.type}>
        <select
          id="rule-type"
          name="type"
          value={type}
          onChange={(e) => setChosen(e.target.value as BrandRuleType)}
          className={`${inputClass} md:max-w-sm`}
        >
          {BRAND_RULE_TYPES.map((option) => (
            <option key={option} value={option} disabled={usedTypes.includes(option)}>
              {RULE_TYPE_LABEL[option]}
              {usedTypes.includes(option) ? " (already added)" : ""}
            </option>
          ))}
        </select>
      </Field>

      <div key={fieldsKey} className="grid gap-4">
        {type === "max_hashtags" && (
          <Field id="rule-max" label="Maximum hashtags per post" hint="Use 0 for no hashtags.">
            <input
              id="rule-max"
              name="max"
              type="number"
              min={0}
              max={30}
              required
              defaultValue={v?.max ?? "5"}
              className={`${inputClass} w-28`}
            />
          </Field>
        )}

        {(type === "blocked_phrase" || type === "required_phrase") && (
          <Field
            id="rule-phrase"
            label={type === "blocked_phrase" ? "Phrase to never use" : "Phrase every post must include"}
          >
            <input
              id="rule-phrase"
              name="phrase"
              required
              maxLength={80}
              defaultValue={v?.phrase ?? ""}
              placeholder={type === "blocked_phrase" ? "cheapest in India" : "Made in Coimbatore"}
              className={inputClass}
            />
          </Field>
        )}

        {type === "custom" && (
          <Field id="rule-instruction" label="Instruction" hint="Keep it short and specific.">
            <textarea
              id="rule-instruction"
              name="instruction"
              rows={2}
              required
              maxLength={280}
              defaultValue={v?.instruction ?? ""}
              placeholder="Use formal English and avoid slang."
              className={inputClass}
            />
          </Field>
        )}

        {(type === "no_emojis" || type === "no_weekend_posts") && (
          <p className="text-sm text-muted">
            {type === "no_emojis"
              ? "Posts for this client will not include emojis."
              : "Posts for this client will not be scheduled on Saturdays or Sundays."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonPrimary} disabled={pending}>
          {pending ? "Adding..." : "Add rule"}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
