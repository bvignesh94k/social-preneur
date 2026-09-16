"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";

export type SignInState = { error?: string; email?: string } | undefined;

const SignInSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = SignInSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email address and password.", email };

  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        error:
          error.statusCode === 429
            ? "Too many sign-in attempts. Wait a minute and try again."
            : "That email and password do not match an account.",
        email,
      };
    }
    throw error;
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
  }
  redirect("/sign-in");
}
