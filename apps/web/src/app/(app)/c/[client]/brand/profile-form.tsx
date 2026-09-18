"use client";

import { isHexColor, SOCIAL_PLATFORMS, TONE_PRESETS, type BrandColor, type SocialLinks } from "@sp/core";
import { useActionState, useState } from "react";
import { Field, FormSection, FormStatus } from "@/components/form-parts";
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import { saveProfileAction } from "./actions";

export interface ProfileFormValues {
  description: string;
  targetAudience: string;
  targetLocations: string;
  usps: string;
  toneOfVoice: string[];
  contentStyle: string;
  primaryCta: string;
  ctaUrl: string;
  phone: string;
  email: string;
  brandColors: BrandColor[];
  fonts: string;
  preferredHashtags: string;
  wordsToAvoid: string;
  socialLinks: SocialLinks;
  lastSaved: string | null;
}

type TextField = {
  [K in keyof ProfileFormValues]: ProfileFormValues[K] extends string ? K : never;
}[keyof ProfileFormValues];

export function ProfileForm({
  clientId,
  slug,
  readOnly,
  initial,
}: {
  clientId: string;
  slug: string;
  readOnly: boolean;
  initial: ProfileFormValues;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, undefined);
  const [colors, setColors] = useState<BrandColor[]>(initial.brandColors);

  const submitted = state?.values;
  const errors = state?.errors ?? {};
  const pick = (key: TextField) => submitted?.[key] ?? initial[key];
  const tones = new Set(submitted ? (submitted.toneOfVoice ?? "").split("|").filter(Boolean) : initial.toneOfVoice);
  const invalid = (key: string) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {});

  const updateColor = (index: number, patch: Partial<BrandColor>) =>
    setColors((list) => list.map((color, i) => (i === index ? { ...color, ...patch } : color)));

  return (
    <form action={action} className="grid gap-6 rounded-lg border border-line bg-surface p-5 sm:p-6">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="brandColors" value={JSON.stringify(colors)} />

      <fieldset disabled={readOnly} className="grid min-w-0 gap-6">
        <FormSection title="About the business" description="Plain facts about what this client does and who it serves.">
          <Field id="description" label="What the business does" error={errors.description}>
            <textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={pick("description")}
              placeholder="We manufacture thermal labels and barcode ribbons for factories and warehouses across South India."
              className={inputClass}
              {...invalid("description")}
            />
          </Field>
          <Field id="targetAudience" label="Target audience" error={errors.targetAudience}>
            <textarea
              id="targetAudience"
              name="targetAudience"
              rows={3}
              defaultValue={pick("targetAudience")}
              placeholder="Plant managers, procurement heads and warehouse supervisors."
              className={inputClass}
              {...invalid("targetAudience")}
            />
          </Field>
          <Field id="targetLocations" label="Target locations" hint="Separate with commas." optional>
            <input
              id="targetLocations"
              name="targetLocations"
              defaultValue={pick("targetLocations")}
              placeholder="Coimbatore, Chennai, Bengaluru"
              className={inputClass}
            />
          </Field>
          <Field
            id="usps"
            label="Unique selling points"
            hint="One per line. Only include points the client can stand behind."
            optional
          >
            <textarea id="usps" name="usps" rows={4} defaultValue={pick("usps")} className={inputClass} />
          </Field>
        </FormSection>

        <FormSection title="Voice and style">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Tone of voice</legend>
            <div className="flex flex-wrap gap-2">
              {TONE_PRESETS.map((tone) => (
                <label
                  key={tone}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:disabled]:cursor-default"
                >
                  <input
                    type="checkbox"
                    name="toneOfVoice"
                    value={tone}
                    defaultChecked={tones.has(tone)}
                    className="accent-[var(--accent)]"
                  />
                  {tone}
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            id="contentStyle"
            label="Style notes"
            hint='For example: "Short sentences. Explain technical terms. Use Indian English."'
            error={errors.contentStyle}
            optional
          >
            <textarea
              id="contentStyle"
              name="contentStyle"
              rows={3}
              defaultValue={pick("contentStyle")}
              className={inputClass}
              {...invalid("contentStyle")}
            />
          </Field>
        </FormSection>

        <FormSection title="Calls to action and contact">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="primaryCta" label="Main call to action" error={errors.primaryCta} optional>
              <input
                id="primaryCta"
                name="primaryCta"
                defaultValue={pick("primaryCta")}
                placeholder="Request a free sample"
                className={inputClass}
                {...invalid("primaryCta")}
              />
            </Field>
            <Field id="ctaUrl" label="Call to action link" error={errors.ctaUrl} optional>
              <input
                id="ctaUrl"
                name="ctaUrl"
                type="url"
                inputMode="url"
                defaultValue={pick("ctaUrl")}
                placeholder="https://"
                className={inputClass}
                {...invalid("ctaUrl")}
              />
            </Field>
            <Field id="phone" label="Phone" error={errors.phone} optional>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={pick("phone")}
                placeholder="+91 98765 43210"
                className={inputClass}
                {...invalid("phone")}
              />
            </Field>
            <Field id="email" label="Email" error={errors.email} optional>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={pick("email")}
                className={inputClass}
                {...invalid("email")}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Visual identity" description="Designers see these in every creative brief.">
          <div className="grid gap-2">
            <span className="text-sm font-medium">Brand colours</span>
            {colors.length === 0 && <p className="text-sm text-muted">No colours added yet.</p>}
            <ul className="grid gap-2">
              {colors.map((color, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    aria-label={`Colour ${index + 1} picker`}
                    value={isHexColor(color.hex) ? color.hex : "#000000"}
                    onChange={(e) => updateColor(index, { hex: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded-md border border-line bg-surface p-1"
                  />
                  <input
                    aria-label={`Colour ${index + 1} hex value`}
                    value={color.hex}
                    onChange={(e) => updateColor(index, { hex: e.target.value })}
                    className={`${inputClass} w-28 font-mono`}
                  />
                  <input
                    aria-label={`Colour ${index + 1} name`}
                    value={color.name}
                    placeholder="Name, for example Primary green"
                    onChange={(e) => updateColor(index, { name: e.target.value })}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setColors((list) => list.filter((_, i) => i !== index))}
                      className="rounded-md px-2 py-1 text-sm text-muted hover:text-crit"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!readOnly && colors.length < 8 && (
              <button
                type="button"
                className={`${buttonSecondary} justify-self-start`}
                onClick={() => setColors((list) => [...list, { name: "", hex: "#0f6b57" }])}
              >
                Add colour
              </button>
            )}
            {errors.brandColors && <p className="text-sm text-crit">{errors.brandColors}</p>}
          </div>
          <Field id="fonts" label="Fonts" hint="Separate with commas." optional>
            <input id="fonts" name="fonts" defaultValue={pick("fonts")} placeholder="Poppins, Noto Sans Tamil" className={inputClass} />
          </Field>
        </FormSection>

        <FormSection title="Hashtags and words">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              id="preferredHashtags"
              label="Preferred hashtags"
              hint="Separate with spaces or commas. Tamil hashtags work too."
              optional
            >
              <textarea
                id="preferredHashtags"
                name="preferredHashtags"
                rows={3}
                defaultValue={pick("preferredHashtags")}
                placeholder="#ThermalLabels #Coimbatore #மேட்இன்இந்தியா"
                className={inputClass}
              />
            </Field>
            <Field id="wordsToAvoid" label="Words and phrases to avoid" hint="Separate with commas." optional>
              <textarea
                id="wordsToAvoid"
                name="wordsToAvoid"
                rows={3}
                defaultValue={pick("wordsToAvoid")}
                placeholder="cheapest, guaranteed, number one"
                className={inputClass}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Social profile links"
          description="Public profile addresses. Connecting accounts for publishing is a separate step that comes later."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {SOCIAL_PLATFORMS.map((platform) => {
              const name = `social_${platform}`;
              return (
                <Field key={platform} id={name} label={SOCIAL_PLATFORM_LABEL[platform]} error={errors[name]} optional>
                  <input
                    id={name}
                    name={name}
                    type="url"
                    inputMode="url"
                    defaultValue={submitted?.[name] ?? initial.socialLinks[platform] ?? ""}
                    placeholder="https://"
                    className={inputClass}
                    {...invalid(name)}
                  />
                </Field>
              );
            })}
          </div>
        </FormSection>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button type="submit" className={buttonPrimary} disabled={pending}>
            {pending ? "Saving..." : "Save profile"}
          </button>
          <FormStatus state={state} idleText={initial.lastSaved ? `Last saved ${initial.lastSaved}` : null} />
        </div>
      )}
    </form>
  );
}
