import { brandCardInputHash, type BrandCard } from "@sp/ai";
import { getBrandCardSources, getClient } from "@sp/db";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { buttonPrimary, Chip, SectionHeader } from "@/components/ui";
import { getBrandWorkspace } from "@/data/brand";
import { formatDateTime } from "@/lib/labels";
import { toBrandCardInput } from "@/server/brand-card";
import { generateBrandCardAction } from "../ai-actions";

export const metadata: Metadata = { title: "Brand summary" };

export const maxDuration = 300;

export default async function BrandSummaryPage({ params }: PageProps<"/c/[client]/brand/summary">) {
  const ws = await getBrandWorkspace((await params).client);
  const [client, sources] = await Promise.all([getClient(ws.db, ws.scope), getBrandCardSources(ws.db, ws.scope)]);

  const profile = sources.profile;
  const card = (profile?.brandCard ?? null) as BrandCard | null;
  const upToDate = Boolean(card && profile?.brandCardInputHash === brandCardInputHash(toBrandCardInput(client, sources)));
  const hasDescription = Boolean(profile?.description);

  return (
    <div className="grid gap-6">
      <SectionHeader
        title="Brand summary"
        description="A short briefing the AI reads before writing anything for this client. Proof points and rules are copied from verified facts and active rules, never written by the AI."
      />

      <div className="flex flex-wrap items-start gap-3">
        {card && (
          <Chip tone={upToDate ? "ok" : "warn"}>{upToDate ? "Up to date" : "Out of date"}</Chip>
        )}
        {card && profile?.brandCardGeneratedAt && (
          <span className="text-sm text-muted">Written {formatDateTime(profile.brandCardGeneratedAt, ws.timezone)}</span>
        )}
        {ws.can.edit && hasDescription && (
          <div className="sm:ml-auto">
            <ActionButton
              action={generateBrandCardAction}
              fields={{ clientId: ws.client.id, slug: ws.client.slug }}
              pendingText="Writing summary, this can take a minute..."
              className={buttonPrimary}
            >
              {card ? "Rewrite summary" : "Write summary"}
            </ActionButton>
          </div>
        )}
      </div>

      {card && !upToDate && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          The Brand Brain has changed since this summary was written. Rewrite it so content uses the latest details.
        </p>
      )}

      {!hasDescription && (
        <p className="rounded-lg border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">
          Add a business description in the brand profile first. The summary is built from it.
        </p>
      )}

      {hasDescription && !card && (
        <p className="rounded-lg border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">
          {ws.can.edit ? "No summary yet. Write one when the profile, products and facts look right." : "No summary has been written yet."}
        </p>
      )}

      {card && (
        <article className="grid gap-5 rounded-lg border border-line bg-surface p-5 sm:p-6">
          <CardSection title="What the business does">
            <p>{card.summary}</p>
          </CardSection>
          <div className="grid gap-5 md:grid-cols-2">
            <CardSection title="Audience">
              <p>{card.audience}</p>
            </CardSection>
            <CardSection title="Voice">
              <p>{card.voice}</p>
            </CardSection>
          </div>
          <CardSection title="Products and services">
            <List items={card.offerings} empty="No active products or services." />
          </CardSection>
          <CardSection title="Proof points">
            <List items={card.proofPoints} empty="No verified facts yet. Verify facts so content has proof points to use." />
          </CardSection>
          <div className="grid gap-5 md:grid-cols-2">
            <CardSection title="Rules">
              <List items={card.rules} empty="No active content rules." />
            </CardSection>
            <CardSection title="Avoid">
              <List items={card.avoid} empty="Nothing listed." />
            </CardSection>
          </div>
        </article>
      )}
    </div>
  );
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{title}</h3>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="grid gap-1">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
          {item}
        </li>
      ))}
    </ul>
  );
}
