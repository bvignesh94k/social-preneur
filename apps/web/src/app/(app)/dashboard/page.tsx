import { isAllowed } from "@sp/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ClientMark } from "@/components/client-mark";
import { buttonPrimary, Chip, PageHeader } from "@/components/ui";
import { getMyClients } from "@/data/clients";
import { CLIENT_STATUS_LABEL, LANGUAGE_LABEL } from "@/lib/labels";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user, agency, actor } = await requireWorkspace();
  const clients = await getMyClients();
  const canCreate = isAllowed(actor, "client.create");

  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: agency.timezone }).format(now),
  );
  const partOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: agency.timezone,
  }).format(now);

  const paused = clients.filter((c) => c.publishingPaused);
  const settingUp = clients.filter((c) => c.status === "onboarding");

  return (
    <div className="grid gap-10">
      <PageHeader
        eyebrow={dateLabel}
        title={`Good ${partOfDay}, ${user.name.split(" ")[0]}`}
        actions={
          canCreate && (
            <Link href="/clients/new" className={buttonPrimary}>
              Add client
            </Link>
          )
        }
      />

      <section aria-labelledby="attention-heading" className="grid gap-3">
        <h2 id="attention-heading" className="font-display text-lg font-bold">
          Needs attention
        </h2>
        {paused.length === 0 && settingUp.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
            Nothing needs attention right now.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {paused.map((c) => (
              <li key={`paused-${c.slug}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <ClientMark name={c.name} slug={c.slug} size="sm" />
                <span className="text-sm font-medium">{c.name}</span>
                <Chip tone="crit">Publishing paused</Chip>
                <Link href={`/c/${c.slug}`} className="ml-auto text-sm font-medium text-accent hover:underline">
                  Review
                </Link>
              </li>
            ))}
            {settingUp.length > 0 && (
              <li className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Chip tone="warn">Setting up</Chip>
                <span className="text-sm">
                  {settingUp.length} {settingUp.length === 1 ? "client is" : "clients are"} still being set up. Brand
                  profiles and social accounts arrive in the next modules.
                </span>
              </li>
            )}
          </ul>
        )}
      </section>

      <section aria-labelledby="clients-heading" className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="clients-heading" className="font-display text-lg font-bold">
            Your clients
          </h2>
          {clients.length > 0 && (
            <Link href="/clients" className="text-sm font-medium text-accent hover:underline">
              View all
            </Link>
          )}
        </div>

        {clients.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
            <p className="font-medium">No clients yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              {canCreate
                ? "Add your first client to start building their brand profile and content calendar."
                : "You are not assigned to any client yet. Ask an agency admin to add you to one."}
            </p>
            {canCreate && (
              <Link href="/clients/new" className={`${buttonPrimary} mt-4`}>
                Add client
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/c/${c.slug}`}
                  className="flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 hover:border-accent"
                >
                  <div className="flex items-center gap-3">
                    <ClientMark name={c.name} slug={c.slug} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-sm text-muted">{c.industry ?? "Industry not set"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip tone={c.status === "active" ? "ok" : "warn"}>{CLIENT_STATUS_LABEL[c.status]}</Chip>
                    <Chip>{LANGUAGE_LABEL[c.defaultLanguage]}</Chip>
                    {c.publishingPaused && <Chip tone="crit">Paused</Chip>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
