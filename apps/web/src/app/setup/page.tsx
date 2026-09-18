import { hasAnyAgency } from "@sp/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up Social Preneur" };

// Must check the database on every request, never at build time.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasAnyAgency(await getDb())) notFound();

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight">
          <span aria-hidden className="block h-4 w-5 rounded-[3px] border-2 border-t-[6px] border-accent" />
          Social Preneur
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Set up Social Preneur</h1>
        <p className="mt-1 text-sm text-muted">
          Create your agency and the first admin account. This page stops working as soon as setup is complete.
        </p>
        {env.SETUP_TOKEN ? (
          <SetupForm />
        ) : (
          <p className="mt-6 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            First-time setup is turned off. Add a SETUP_TOKEN value in your hosting environment settings, redeploy,
            then open this page again.
          </p>
        )}
      </div>
    </main>
  );
}
