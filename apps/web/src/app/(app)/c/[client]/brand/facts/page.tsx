import { listFacts, listOfferings } from "@sp/db";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { buttonPrimarySm, buttonSecondarySm, Chip, SectionHeader } from "@/components/ui";
import { getBrandWorkspace } from "@/data/brand";
import { FACT_KIND_LABEL } from "@/lib/labels";
import { reviewFactAction } from "../actions";
import { FactForm, type FactDto, type OfferingOption } from "./fact-form";

export const metadata: Metadata = { title: "Facts" };

interface GroupProps {
  facts: FactDto[];
  offeringName: Map<string, string>;
  offerings: OfferingOption[];
  canReview: boolean;
  hidden: { clientId: string; slug: string };
}

export default async function FactsPage({ params }: PageProps<"/c/[client]/brand/facts">) {
  const ws = await getBrandWorkspace((await params).client);
  const [factRows, offeringRows] = await Promise.all([listFacts(ws.db, ws.scope), listOfferings(ws.db, ws.scope)]);

  const offerings: OfferingOption[] = offeringRows
    .filter((o) => o.status === "active")
    .map(({ id, name, kind }) => ({ id, name, kind }));
  const offeringName = new Map(offeringRows.map((o) => [o.id, o.name]));
  const facts: FactDto[] = factRows.map((f) => ({
    id: f.id,
    kind: f.kind,
    statement: f.statement,
    sourceRef: f.sourceRef,
    offeringId: f.offeringId,
    status: f.status,
    canEdit: ws.can.edit || (f.createdBy === ws.actorId && f.status === "unverified"),
  }));

  const group: Omit<GroupProps, "facts"> = {
    offeringName,
    offerings,
    canReview: ws.can.edit,
    hidden: { clientId: ws.client.id, slug: ws.client.slug },
  };
  const review = facts.filter((f) => f.status === "unverified");
  const verified = facts.filter((f) => f.status === "verified");
  const rejected = facts.filter((f) => f.status === "rejected");

  return (
    <div className="grid gap-6">
      <SectionHeader
        title="Facts"
        description="Numbers, certifications, awards, testimonials and results that content may mention."
      />

      <p className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
        Only <strong>verified</strong> facts will be used as claims in AI-written content.{" "}
        {ws.can.edit
          ? "Check each fact against its source before verifying it."
          : "A manager or admin verifies the facts you add."}
      </p>

      {ws.can.suggest && (
        <details className="group rounded-lg border border-line bg-surface" open={facts.length === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
            Add a fact
            <span aria-hidden className="text-xl leading-none text-muted transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="border-t border-line p-5">
            <FactForm {...group.hidden} offerings={offerings} canVerify={ws.can.edit} />
          </div>
        </details>
      )}

      {facts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">
          No facts yet. Start with certifications, years in business or product specifications you can prove.
        </p>
      ) : (
        <>
          {review.length > 0 && <FactGroup title="Needs review" {...group} facts={review} />}
          {verified.length > 0 && <FactGroup title="Verified" {...group} facts={verified} />}
          {rejected.length > 0 && (
            <details className="rounded-lg border border-line bg-surface">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Rejected ({rejected.length})</summary>
              <div className="border-t border-line p-4">
                <FactGroup title="Rejected" {...group} facts={rejected} hideTitle />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function FactGroup({
  title,
  facts,
  offeringName,
  offerings,
  canReview,
  hidden,
  hideTitle,
}: GroupProps & { title: string; hideTitle?: boolean }) {
  return (
    <section aria-label={title} className="grid gap-3">
      {!hideTitle && (
        <h3 className="font-display text-base font-bold">
          {title} <span className="font-sans text-sm font-normal text-muted">{facts.length}</span>
        </h3>
      )}
      <ul className="grid gap-3">
        {facts.map((fact) => (
          <li key={fact.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start gap-3">
              <p className="min-w-0 flex-1">{fact.statement}</p>
              <Chip tone={fact.status === "verified" ? "ok" : fact.status === "rejected" ? "crit" : "warn"}>
                {fact.status === "verified" ? "Verified" : fact.status === "rejected" ? "Rejected" : "Needs review"}
              </Chip>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>{FACT_KIND_LABEL[fact.kind]}</span>
              <span>{fact.offeringId ? offeringName.get(fact.offeringId) ?? "Archived item" : "Whole business"}</span>
              {fact.sourceRef && <span>Source: {fact.sourceRef}</span>}
            </div>

            {(canReview || fact.canEdit) && (
              <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-line pt-3">
                {canReview && fact.status !== "verified" && (
                  <ActionButton
                    action={reviewFactAction}
                    fields={{ ...hidden, factId: fact.id, decision: "verified" }}
                    pendingText="Verifying..."
                    className={buttonPrimarySm}
                  >
                    Verify
                  </ActionButton>
                )}
                {canReview && fact.status !== "rejected" && (
                  <ActionButton
                    action={reviewFactAction}
                    fields={{ ...hidden, factId: fact.id, decision: "rejected" }}
                    pendingText="Rejecting..."
                    className={buttonSecondarySm}
                  >
                    Reject
                  </ActionButton>
                )}
                {fact.canEdit && (
                  <details className="w-full">
                    <summary className="cursor-pointer text-sm font-medium text-accent">Edit</summary>
                    <div className="mt-4">
                      <FactForm {...hidden} offerings={offerings} canVerify={canReview} fact={fact} />
                    </div>
                  </details>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
