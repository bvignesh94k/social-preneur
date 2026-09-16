import Link from "next/link";
import { buttonPrimary } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-muted">It may not exist, or your account may not have access to it.</p>
        <Link href="/dashboard" className={`${buttonPrimary} mt-6`}>
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
