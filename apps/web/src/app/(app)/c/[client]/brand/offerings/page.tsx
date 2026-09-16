import { listOfferings } from "@sp/db";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { buttonSecondarySm, Chip, SectionHeader } from "@/components/ui";
import { getBrandWorkspace } from "@/data/brand";
import { setOfferingStatusAction } from "../actions";
import { OfferingForm, type OfferingDto } from "./offering-form";

export const metadata: Metadata = { title: "Products and services" };

type Hidden = { clientId: string; slug: string };

export default async function OfferingsPage({ params }: PageProps<"/c/[client]/brand/offerings">) {
  const ws = await getBrandWorkspace((await params).client);
  const rows = await listOfferings(ws.db, ws.scope);
  const items: OfferingDto[] = rows.map(({ id, kind, name, summary, benefits, audience, url, status }) => ({
    id,
    kind,
    name,
    summary,
    benefits,
    audience,
    url,
    status,
  }));
  const active = items.filter((item) => item.status === "active");
  const archived = items.filter((item) => item.status === "archived");
  const hidden: Hidden = { clientId: ws.client.id, slug: ws.client.slug };

  return (
    <div className="grid gap-6">
      <SectionHeader
        title="Products and services"
        description="What this client sells. Content suggestions will rotate through these so nothing important is forgotten."
      />

      {ws.can.edit && (
        <details className="group rounded-lg border border-line bg-surface" open={items.length === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
            Add a product or service
            <span aria-hidden className="text-xl leading-none text-muted transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="border-t border-line p-5">
            <OfferingForm {...hidden} />
          </div>
        </details>
      )}

      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">
          {ws.can.edit
            ? "No products or services yet. Add the main ones this client wants to promote."
            : "No products or services have been added yet."}
        </p>
      ) : (
        (["product", "service"] as const).map((kind) => {
          const list = active.filter((item) => item.kind === kind);
          if (list.length === 0) return null;
          return (
            <section key={kind} aria-labelledby={`${kind}-heading`} className="grid gap-3">
              <h3 id={`${kind}-heading`} className="font-display text-base font-bold">
                {kind === "product" ? "Products" : "Services"}{" "}
                <span className="font-sans text-sm font-normal text-muted">{list.length}</span>
              </h3>
              <ul className="grid gap-3">
                {list.map((item) => (
                  <OfferingCard key={item.id} item={item} canEdit={ws.can.edit} hidden={hidden} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {archived.length > 0 && (
        <details className="rounded-lg border border-line bg-surface">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Archived ({archived.length})</summary>
          <ul className="grid gap-3 border-t border-line p-4">
            {archived.map((item) => (
              <OfferingCard key={item.id} item={item} canEdit={ws.can.edit} hidden={hidden} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function OfferingCard({ item, canEdit, hidden }: { item: OfferingDto; canEdit: boolean; hidden: Hidden }) {
  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.name}</p>
          {item.summary && <p className="mt-1 text-sm text-muted">{item.summary}</p>}
        </div>
        {item.status === "archived" && <Chip>Archived</Chip>}
      </div>

      {item.benefits.length > 0 && (
        <ul className="mt-3 grid gap-1 text-sm">
          {item.benefits.map((benefit) => (
            <li key={benefit} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              {benefit}
            </li>
          ))}
        </ul>
      )}

      {(item.audience || item.url) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {item.audience && <span>For: {item.audience}</span>}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {item.url.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      )}

      {canEdit && item.status === "archived" && (
        <div className="mt-3 border-t border-line pt-3">
          <ActionButton
            action={setOfferingStatusAction}
            fields={{ ...hidden, offeringId: item.id, status: "active" }}
            pendingText="Restoring..."
            className={buttonSecondarySm}
          >
            Restore
          </ActionButton>
        </div>
      )}

      {canEdit && item.status === "active" && (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-medium text-accent">Edit</summary>
          <div className="mt-4 grid gap-4">
            <OfferingForm {...hidden} offering={item} />
            <div className="border-t border-line pt-3">
              <ActionButton
                action={setOfferingStatusAction}
                fields={{ ...hidden, offeringId: item.id, status: "archived" }}
                pendingText="Archiving..."
                className={buttonSecondarySm}
              >
                Archive
              </ActionButton>
            </div>
          </div>
        </details>
      )}
    </li>
  );
}
