import type { Metadata } from "next";
import { signOutAction } from "@/app/actions/auth";
import { buttonSecondary } from "@/components/ui";

export const metadata: Metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-bold">Your account is not part of an agency yet</h1>
        <p className="mt-2 text-muted">
          Ask your agency admin to invite this email address. Once you are added, sign in again.
        </p>
        <form action={signOutAction} className="mt-6">
          <button type="submit" className={buttonSecondary}>
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
