import { ClientMark } from "@/components/client-mark";
import { Chip } from "@/components/ui";
import { getClientOverview } from "@/data/clients";
import { CLIENT_STATUS_LABEL, LANGUAGE_LABEL } from "@/lib/labels";
import { ClientTabs } from "./client-tabs";

export default async function ClientLayout({ children, params }: LayoutProps<"/c/[client]">) {
  const { client, can } = await getClientOverview((await params).client);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <header className="flex flex-wrap items-center gap-4">
          <ClientMark name={client.name} slug={client.slug} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-tight text-balance">{client.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>{client.industry ?? "Industry not set"}</span>
              {client.website && (
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  {client.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:ml-auto">
            <Chip tone={client.status === "active" ? "ok" : "warn"}>{CLIENT_STATUS_LABEL[client.status]}</Chip>
            <Chip>{LANGUAGE_LABEL[client.defaultLanguage]}</Chip>
          </div>
        </header>
        <ClientTabs
          slug={client.slug}
          showBrand={can.viewBrand}
          showContent={can.viewCalendar}
          showAccounts={can.manageAccounts}
          showSettings={can.manageSettings}
        />
      </div>

      {client.publishingPaused && (
        <p role="status" className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          Publishing is paused for this client. Nothing will be published until it is resumed.
        </p>
      )}

      {children}
    </div>
  );
}
