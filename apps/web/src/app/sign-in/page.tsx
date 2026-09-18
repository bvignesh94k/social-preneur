import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getSessionUser()) redirect("/dashboard");
  const setupDone = (await searchParams).setup === "done";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight">
          <span aria-hidden className="block h-4 w-5 rounded-[3px] border-2 border-t-[6px] border-accent" />
          Social Preneur
        </div>
        {setupDone && (
          <p role="status" className="mb-6 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-ink">
            Setup is complete. Sign in with the account you just created.
          </p>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Use the email address your agency added you with.</p>
        <SignInForm />
        <p className="mt-8 text-xs text-muted">Accounts are created by invitation from your agency admin.</p>
      </div>
    </main>
  );
}
