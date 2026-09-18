import { isAllowed } from "@sp/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ClientMark } from "@/components/client-mark";
import { buttonPrimary, Chip, PageHeader } from "@/components/ui";
import { getMyClients } from "@/data/clients";
import { CLIENT_STATUS_LABEL, LANGUAGE_LABEL } from "@/lib/labels";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const { actor } = await requireWorkspace();
  const clients = await getMyClients();
  const canCreate = isAllowed(actor, "client.create");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Clients"
        description={
          isAllowed(actor, "client.view", { clientRole: null })
            ? "Every client in your agency."
            : "Clients you are assigned to."
        }
        actions={
          canCreate && (
            <Link href="/clients/new" className={buttonPrimary}>
              Add client
            </Link>
          )
        }
      />

      {clients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-muted">
          {canCreate ? "No clients yet. Add your first client to get started." : "You are not assigned to any client yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-sunk text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Industry</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Content language</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Publishing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((c) => (
                <tr key={c.slug} className="hover:bg-sunk/60">
                  <td className="px-4 py-3">
                    <Link href={`/c/${c.slug}`} className="flex items-center gap-3 font-medium hover:text-accent">
                      <ClientMark name={c.name} slug={c.slug} size="sm" />
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.industry ?? "Not set"}</td>
                  <td className="px-4 py-3">{LANGUAGE_LABEL[c.defaultLanguage]}</td>
                  <td className="px-4 py-3">
                    <Chip tone={c.status === "active" ? "ok" : "warn"}>{CLIENT_STATUS_LABEL[c.status]}</Chip>
                  </td>
                  <td className="px-4 py-3">
                    {c.publishingPaused ? <Chip tone="crit">Paused</Chip> : <Chip tone="ok">On</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
