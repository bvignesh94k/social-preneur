"use server";

import { InvalidInputError } from "@sp/core";
import { bootstrapAgency } from "@sp/db";
import { hashPassword } from "better-auth/crypto";
import { redirect } from "next/navigation";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import type { FormState } from "@/lib/form-state";

const SetupSchema = z
  .object({
    agencyName: z.string().trim().min(2, "Enter the agency name.").max(120, "Keep the name under 120 characters."),
    name: z.string().trim().min(2, "Enter your name.").max(80, "Keep your name under 80 characters."),
    email: z
      .email("Enter a valid email address.")
      .transform((value) => value.toLowerCase()),
    password: z.string().min(12, "Use at least 12 characters.").max(200, "Use at most 200 characters."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { path: ["confirm"], error: "The passwords do not match." });

// Hashing both values first gives equal lengths, so the comparison takes the same time for any guess.
function tokenMatches(given: string): boolean {
  if (!env.SETUP_TOKEN) return false;
  const expected = createHash("sha256").update(env.SETUP_TOKEN).digest();
  const actual = createHash("sha256").update(given).digest();
  return timingSafeEqual(expected, actual);
}

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const values = { agencyName: text("agencyName"), name: text("name"), email: text("email").trim() };

  if (!tokenMatches(text("token"))) return { errors: { token: "That setup token is not correct." }, values };

  const parsed = SetupSchema.safeParse({ ...values, password: text("password"), confirm: text("confirm") });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { errors, values };
  }

  try {
    await bootstrapAgency(await getDb(), {
      agencyName: parsed.data.agencyName,
      ownerName: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
    });
  } catch (error) {
    if (error instanceof InvalidInputError) return { message: error.message, values };
    throw error;
  }

  redirect("/sign-in?setup=done");
}
