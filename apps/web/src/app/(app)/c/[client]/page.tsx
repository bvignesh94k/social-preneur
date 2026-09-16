import type { Metadata } from "next";
import Link from "next/link";
import { Chip } from "@/components/ui";
import { getClientOverview } from "@/data/clients";
import { AGENCY_ROLE_LABEL, APPROVAL_MODE_LABEL, CLIENT_ROLE_LABEL, formatMinutes } from "@/lib/labels";
import { PauseControl } from "./pause-control";

export async function generateMetadata({ params }: PageProps<"/c/[client]">): Promise<Metadata> {
  const { client } = await getClientOverview((await params).client);
  return { title: client.name };
}

interface SetupStep {
  label: string;
  status: "done" | "todo" | "soon";
  href?: string;
}

export default async function ClientOverviewPage({ params }: PageProps<"/c/[client]">) {
  const { client, members, brandReady, can } = await getClientOverview((await params).client);

  const steps: SetupStep[] = [
    { label: "Client added", status: "done" },
    {
      label: "Brand Brain: profile and at least one product or service",
      status: brandReady ? "done" : "todo",
      href: `/c/${client.slug}/brand`,
    },
    { label: "Social accounts connected", status: "soon" },
    { label: "Content strategy and monthly mix", status: "soon" },
    { label: "First content calendar", status: "soon" },
  ];

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {can.viewBrand ? (
          <section aria-labelledby="setup-heading" className="rounded-lg border border-line bg-surface p-5">
            <h2 id="setup-heading" className="font-display text-lg font-bold">
              Setup
            </h2>
            <ol className="mt-4 grid gap-3">
              {steps.map((step) => (
                <li key={step.label} className="flex items-start gap-3 text-sm">
                  <span
                    aria-hidden
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                      step.status === "done" ? "border-accent bg-accent text-surface" : "border-line"
                    }`}
                  >
                    {step.status === "done" && (
                      <svg viewBox="0 0 16 16" className="size-3 fill-none stroke-current stroke-[2.5]">
                        <path d="M3.5 8.5l3 3 6-7" />
                      </svg>
                    )}
                  </span>
                  <span className={step.status === "soon" ? "text-muted" : ""}>{step.label}</span>
                  <span className="ml-auto shrink-0">
                    {step.status === "todo" && step.href && (
                      <Link href={step.href} className="text-sm font-medium text-accent hover:underline">
                        Set up
                      </Link>
                    )}
                    {step.status === "soon" && <Chip>Coming soon</Chip>}
                  </span>
                  <span className="sr-only">
                    {step.status === "done" ? "Done" : step.status === "todo" ? "Not done yet" : "Not available yet"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <section className="rounded-lg border border-line bg-surface p-5 text-sm text-muted">
            Your agency is preparing this workspace. Content for review will appear here.
          </section>
        )}

        <div className="grid content-start gap-6">
          <section aria-labelledby="publishing-heading" className="grid gap-3 rounded-lg border border-line bg-surface p-5">
            <h2 id="publishing-heading" className="font-display text-lg font-bold">
              Publishing
            </h2>
            <p className="text-sm text-muted">
              {client.publishingPaused
                ? "All publishing for this client is on hold."
                : "Pausing stops every scheduled post for this client at once, for example during a PR issue."}
            </p>
            {can.pausePublishing ? (
              <PauseControl
                key={String(client.publishingPaused)}
                clientId={client.id}
                clientName={client.name}
                paused={client.publishingPaused}
              />
            ) : (
              <p className="text-sm text-muted">Only managers, admins and client approvers can pause publishing.</p>
            )}
          </section>

          <section aria-labelledby="settings-heading" className="rounded-lg border border-line bg-surface p-5">
            <h2 id="settings-heading" className="font-display text-lg font-bold">
              Settings
            </h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Timezone</dt>
              <dd>{client.timezone}</dd>
              <dt className="text-muted">Approval</dt>
              <dd>{APPROVAL_MODE_LABEL[client.approvalMode]}</dd>
              <dt className="text-muted">Late publish window</dt>
              <dd>{formatMinutes(client.lateWindowMinutes)}</dd>
            </dl>
          </section>
        </div>
      </div>

      <section aria-labelledby="team-heading" className="rounded-lg border border-line bg-surface p-5">
        <h2 id="team-heading" className="font-display text-lg font-bold">
          People on this client
        </h2>
        <p className="mt-1 text-sm text-muted">Agency admins can also open every client.</p>
        {members.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No one is assigned to this client yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="font-medium">{m.name}</span>
                {m.email && <span className="text-muted">{m.email}</span>}
                <span className="ml-auto">
                  <Chip tone={m.role === "staff" ? "info" : "warn"}>
                    {m.role === "staff" ? AGENCY_ROLE_LABEL[m.agencyRole] : CLIENT_ROLE_LABEL[m.role]}
                  </Chip>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
