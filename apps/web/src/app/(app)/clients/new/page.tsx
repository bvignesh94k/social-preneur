import { isAllowed } from "@sp/core";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireWorkspace } from "@/lib/session";
import { ClientForm } from "./client-form";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage() {
  const { actor } = await requireWorkspace();

  if (!isAllowed(actor, "client.create")) {
    return (
      <div className="grid max-w-xl gap-4">
        <PageHeader title="Add client" />
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          Only agency admins can add clients. Ask an admin to add the client and assign you to it.
        </p>
        <Link href="/clients" className="text-sm font-medium text-accent hover:underline">
          Back to clients
        </Link>
      </div>
    );
  }

  return (
    <div className="grid max-w-xl gap-6">
      <PageHeader
        title="Add client"
        description="Start with the basics. Brand details, social accounts and content strategy come next."
      />
      <ClientForm />
    </div>
  );
}
