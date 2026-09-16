"use server";

import {
  BRAND_RULE_TYPES,
  FACT_KINDS,
  ForbiddenError,
  InvalidInputError,
  isHexColor,
  NotFoundError,
  OFFERING_KINDS,
  parseHashtags,
  parseLines,
  parseList,
  SOCIAL_PLATFORMS,
  TONE_PRESETS,
  type BrandColor,
  type SocialLinks,
} from "@sp/core";
import {
  createFact,
  createOffering,
  createRule,
  deleteRule,
  reviewFact,
  saveBrandProfile,
  setOfferingStatus,
  updateFact,
  updateOffering,
  updateRule,
} from "@sp/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { requireWorkspace } from "@/lib/session";

// Only web links; blocks javascript: and other schemes that could run code when clicked.
const WEB_URL = { protocol: /^https?$/ };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function snapshot(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    values[key] = key in values ? `${values[key]}|${value}` : value;
  }
  return values;
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

function failure(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof InvalidInputError) return { message: error.message, values };
  if (error instanceof ForbiddenError || error instanceof NotFoundError) {
    return { message: "You do not have permission to make this change.", values };
  }
  throw error;
}

function refresh(formData: FormData) {
  const slug = text(formData, "slug");
  revalidatePath(/^[a-z0-9-]{1,60}$/.test(slug) ? `/c/${slug}` : "/", "layout");
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${label} under ${max} characters.`)
    .transform((value) => value || null);

const optionalUrl = (label: string) =>
  z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.url({ ...WEB_URL, error: `Enter a full web address for ${label}, starting with https://` }).nullable());

// ---------- Profile ----------

const ProfileSchema = z.object({
  description: optionalText(2000, "the description"),
  targetAudience: optionalText(1000, "the target audience"),
  contentStyle: optionalText(1000, "the style notes"),
  primaryCta: optionalText(80, "the call to action"),
  ctaUrl: optionalUrl("the call to action"),
  phone: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.string().regex(/^[+0-9 ()-]{6,20}$/, "Enter a valid phone number.").nullable()),
  email: z
    .string()
    .trim()
    .transform((value) => value || null)
    .pipe(z.email("Enter a valid email address.").nullable()),
});

function parseColors(raw: string): BrandColor[] | null {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length > 8) return null;
  const colors: BrandColor[] = [];
  for (const item of data) {
    const entry = item as { hex?: unknown; name?: unknown } | null;
    const hex = typeof entry?.hex === "string" ? entry.hex.trim().toLowerCase() : "";
    if (!isHexColor(hex)) return null;
    const name = typeof entry?.name === "string" ? entry.name.trim().slice(0, 40) : "";
    colors.push({ name: name || hex, hex });
  }
  return colors;
}

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  const values = snapshot(formData);

  const parsed = ProfileSchema.safeParse({
    description: text(formData, "description"),
    targetAudience: text(formData, "targetAudience"),
    contentStyle: text(formData, "contentStyle"),
    primaryCta: text(formData, "primaryCta"),
    ctaUrl: text(formData, "ctaUrl"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  });
  const errors = parsed.success ? {} : fieldErrors(parsed.error);

  const brandColors = parseColors(text(formData, "brandColors"));
  if (brandColors === null) errors.brandColors = "Each colour needs a valid hex value, such as #0F6B57.";

  const socialLinks: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const url = text(formData, `social_${platform}`).trim();
    if (!url) continue;
    if (z.url(WEB_URL).safeParse(url).success) socialLinks[platform] = url;
    else errors[`social_${platform}`] = "Enter a full web address, starting with https://";
  }

  if (!parsed.success || brandColors === null || Object.keys(errors).length > 0) return { errors, values };

  const tones = new Set<string>(TONE_PRESETS);
  try {
    await saveBrandProfile(await getDb(), actor, text(formData, "clientId"), {
      ...parsed.data,
      targetLocations: parseList(text(formData, "targetLocations"), { max: 20, maxLength: 60 }),
      usps: parseLines(text(formData, "usps"), { max: 10, maxLength: 200 }),
      toneOfVoice: formData.getAll("toneOfVoice").filter((v): v is string => typeof v === "string" && tones.has(v)),
      fonts: parseList(text(formData, "fonts"), { max: 6, maxLength: 60 }),
      preferredHashtags: parseHashtags(text(formData, "preferredHashtags"), 30),
      wordsToAvoid: parseList(text(formData, "wordsToAvoid"), { max: 50, maxLength: 60 }),
      brandColors,
      socialLinks,
    });
  } catch (error) {
    return failure(error, values);
  }

  refresh(formData);
  return { ok: true };
}

// ---------- Products and services ----------

const OfferingSchema = z.object({
  kind: z.enum(OFFERING_KINDS, "Choose product or service."),
  name: z.string().trim().min(2, "Enter a name.").max(120, "Keep the name under 120 characters."),
  summary: optionalText(600, "the summary"),
  audience: optionalText(300, "the audience"),
  url: optionalUrl("the page"),
});

export async function saveOfferingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  const values = snapshot(formData);

  const parsed = OfferingSchema.safeParse({
    kind: text(formData, "kind"),
    name: text(formData, "name"),
    summary: text(formData, "summary"),
    audience: text(formData, "audience"),
    url: text(formData, "url"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const input = { ...parsed.data, benefits: parseLines(text(formData, "benefits"), { max: 10, maxLength: 200 }) };
  const clientId = text(formData, "clientId");
  const offeringId = text(formData, "offeringId");
  const db = await getDb();

  try {
    if (offeringId) await updateOffering(db, actor, clientId, offeringId, input);
    else await createOffering(db, actor, clientId, input);
  } catch (error) {
    return failure(error, values);
  }

  refresh(formData);
  return offeringId ? { ok: true, values } : { ok: true };
}

export async function setOfferingStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  const status = text(formData, "status");
  if (status !== "active" && status !== "archived") return { message: "This request was not valid." };

  try {
    await setOfferingStatus(await getDb(), actor, text(formData, "clientId"), text(formData, "offeringId"), status);
  } catch (error) {
    return failure(error);
  }

  refresh(formData);
  return { ok: true };
}

// ---------- Facts ----------

const FactSchema = z.object({
  kind: z.enum(FACT_KINDS, "Choose what kind of fact this is."),
  statement: z.string().trim().min(3, "Enter the fact.").max(500, "Keep the fact under 500 characters."),
  sourceRef: optionalText(300, "the source"),
  offeringId: z
    .string()
    .trim()
    .transform((value) => value || null),
});

export async function saveFactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  const values = snapshot(formData);

  const parsed = FactSchema.safeParse({
    kind: text(formData, "kind"),
    statement: text(formData, "statement"),
    sourceRef: text(formData, "sourceRef"),
    offeringId: text(formData, "offeringId"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const clientId = text(formData, "clientId");
  const factId = text(formData, "factId");
  const db = await getDb();

  try {
    if (factId) await updateFact(db, actor, clientId, factId, parsed.data);
    else await createFact(db, actor, clientId, parsed.data, { markVerified: text(formData, "markVerified") === "on" });
  } catch (error) {
    return failure(error, values);
  }

  refresh(formData);
  return factId ? { ok: true, values } : { ok: true };
}

export async function reviewFactAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  const decision = text(formData, "decision");
  if (decision !== "verified" && decision !== "rejected") return { message: "This request was not valid." };

  try {
    await reviewFact(await getDb(), actor, text(formData, "clientId"), text(formData, "factId"), decision);
  } catch (error) {
    return failure(error);
  }

  refresh(formData);
  return { ok: true };
}

// ---------- Rules ----------

export async function createRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  const values = snapshot(formData);

  const type = z.enum(BRAND_RULE_TYPES).safeParse(text(formData, "type"));
  if (!type.success) return { errors: { type: "Choose a rule." }, values };

  try {
    await createRule(await getDb(), actor, text(formData, "clientId"), type.data, {
      max: text(formData, "max"),
      phrase: text(formData, "phrase"),
      instruction: text(formData, "instruction"),
    });
  } catch (error) {
    return failure(error, values);
  }

  refresh(formData);
  return { ok: true };
}

export async function toggleRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  try {
    await updateRule(await getDb(), actor, text(formData, "clientId"), text(formData, "ruleId"), {
      isActive: text(formData, "isActive") === "true",
    });
  } catch (error) {
    return failure(error);
  }
  refresh(formData);
  return { ok: true };
}

export async function deleteRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireWorkspace();
  try {
    await deleteRule(await getDb(), actor, text(formData, "clientId"), text(formData, "ruleId"));
  } catch (error) {
    return failure(error);
  }
  refresh(formData);
  return { ok: true };
}
