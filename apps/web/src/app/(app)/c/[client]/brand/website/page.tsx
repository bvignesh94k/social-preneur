import type { FactKind, SocialPlatform } from "@sp/core";
import {
  getBrandProfile,
  getLatestWebsiteScan,
  listPendingSuggestions,
  listScanPages,
  type BrandProfile,
  type BrandSuggestion,
} from "@sp/db";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { buttonPrimarySm, buttonSecondarySm, Chip, SectionHeader } from "@/components/ui";
import { getBrandWorkspace } from "@/data/brand";
import { FACT_KIND_LABEL, formatDateTime, OFFERING_KIND_LABEL, SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import { acceptSuggestionAction, dismissSuggestionAction } from "../ai-actions";
import { ScanForm } from "./scan-form";
import { ScanPoller } from "./scan-poller";

export const metadata: Metadata = { title: "Website scan" };

// Scans run after the response and can take a couple of minutes when the AI model is busy.
export const maxDuration = 300;

type Hidden = { clientId: string; slug: string };

const FIELD_LABEL: Record<string, string> = {
  description: "Business description",
  targetAudience: "Target audience",
  targetLocations: "Target locations",
  usps: "Unique selling points",
  primaryCta: "Main call to action",
  phone: "Phone",
  email: "Email",
  socialLinks: "Social profile links",
};

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function valueLines(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, string>).map(
      ([platform, url]) => `${SOCIAL_PLATFORM_LABEL[platform as SocialPlatform] ?? platform}: ${url}`,
    );
  }
  return [];
}

const payloadValue = (suggestion: BrandSuggestion) => (suggestion.payload as { value?: unknown }).value;

export default async function WebsiteScanPage({ params }: PageProps<"/c/[client]/brand/website">) {
  const ws = await getBrandWorkspace((await params).client);
  const [scan, suggestions, profile] = await Promise.all([
    getLatestWebsiteScan(ws.db, ws.scope),
    listPendingSuggestions(ws.db, ws.scope),
    getBrandProfile(ws.db, ws.scope),
  ]);
  const pages = scan?.status === "done" ? await listScanPages(ws.db, ws.scope, scan.id) : [];
  const running = scan?.status === "queued" || scan?.status === "running";
  const hidden: Hidden = { clientId: ws.client.id, slug: ws.client.slug };

  const profileSuggestions = suggestions.filter((s) => s.kind === "profile_field");
  const offeringSuggestions = suggestions.filter((s) => s.kind === "offering");
  const factSuggestions = suggestions.filter((s) => s.kind === "fact");

  return (
    <div className="grid gap-6">
      <ScanPoller active={running} />
      <SectionHeader
        title="Website scan"
        description="Reads the client's website and suggests profile details, products, services and facts. Nothing changes until someone accepts a suggestion."
      />

      {ws.can.edit && <ScanForm {...hidden} defaultUrl={ws.client.website ?? ""} running={running} />}

      {!scan ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">
          This client&apos;s website has not been scanned yet.
        </p>
      ) : running ? (
        <div role="status" className="flex items-start gap-3 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-info motion-safe:animate-pulse" />
          <span>
            Reading {shortUrl(scan.url)} and analysing it. This usually takes about a minute. The page updates by
            itself.
          </span>
        </div>
      ) : scan.status === "failed" ? (
        <div role="alert" className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          <p className="font-medium">The last scan of {shortUrl(scan.url)} did not finish.</p>
          <p className="mt-1">{scan.errorMessage}</p>
        </div>
      ) : (
        <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          Read {scan.pagesRead} {scan.pagesRead === 1 ? "page" : "pages"} from {shortUrl(scan.url)}
          {scan.pagesSkipped > 0 ? ` and skipped ${scan.pagesSkipped}` : ""}
          {scan.finishedAt ? ` on ${formatDateTime(scan.finishedAt, ws.timezone)}` : ""}.{" "}
          {suggestions.length === 0
            ? "No suggestions are waiting for review."
            : `${suggestions.length} ${suggestions.length === 1 ? "suggestion is" : "suggestions are"} waiting for review.`}
        </p>
      )}

      {profileSuggestions.length > 0 && (
        <SuggestionGroup title="Profile details" count={profileSuggestions.length}>
          {profileSuggestions.map((suggestion) => (
            <ProfileSuggestion
              key={suggestion.id}
              suggestion={suggestion}
              profile={profile}
              canEdit={ws.can.edit}
              hidden={hidden}
            />
          ))}
        </SuggestionGroup>
      )}

      {offeringSuggestions.length > 0 && (
        <SuggestionGroup title="Products and services" count={offeringSuggestions.length}>
          {offeringSuggestions.map((suggestion) => {
            const value = payloadValue(suggestion) as {
              kind: "product" | "service";
              name: string;
              summary: string | null;
              benefits: string[];
            };
            return (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} canEdit={ws.can.edit} hidden={hidden}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{value.name}</p>
                  <Chip>{OFFERING_KIND_LABEL[value.kind]}</Chip>
                </div>
                {value.summary && <p className="text-sm text-muted">{value.summary}</p>}
                {value.benefits.length > 0 && (
                  <ul className="grid gap-1 text-sm">
                    {value.benefits.map((benefit) => (
                      <li key={benefit} className="flex gap-2">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                )}
              </SuggestionCard>
            );
          })}
        </SuggestionGroup>
      )}

      {factSuggestions.length > 0 && (
        <SuggestionGroup
          title="Facts"
          count={factSuggestions.length}
          note="Accepted facts go to Needs review. They are only used in content after someone verifies them."
        >
          {factSuggestions.map((suggestion) => {
            const value = payloadValue(suggestion) as { kind: FactKind; statement: string };
            return (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} canEdit={ws.can.edit} hidden={hidden}>
                <p>{value.statement}</p>
                <p className="text-xs text-muted">{FACT_KIND_LABEL[value.kind]}</p>
              </SuggestionCard>
            );
          })}
        </SuggestionGroup>
      )}

      {pages.length > 0 && (
        <details className="rounded-lg border border-line bg-surface">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Pages read ({pages.length})</summary>
          <ul className="divide-y divide-line border-t border-line">
            {pages.map((page) => (
              <li key={page.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                <a href={page.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-accent hover:underline">
                  {shortUrl(page.url)}
                </a>
                <span className="ml-auto">
                  <Chip>{page.category.replace("_", " ")}</Chip>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SuggestionGroup({
  title,
  count,
  note,
  children,
}: {
  title: string;
  count: number;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="grid gap-3">
      <div>
        <h3 className="font-display text-base font-bold">
          {title} <span className="font-sans text-sm font-normal text-muted">{count}</span>
        </h3>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      <ul className="grid gap-3">{children}</ul>
    </section>
  );
}

function SuggestionActions({ id, hidden }: { id: string; hidden: Hidden }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-line pt-3">
      <ActionButton
        action={acceptSuggestionAction}
        fields={{ ...hidden, suggestionId: id }}
        pendingText="Adding..."
        className={buttonPrimarySm}
      >
        Accept
      </ActionButton>
      <ActionButton
        action={dismissSuggestionAction}
        fields={{ ...hidden, suggestionId: id }}
        pendingText="Dismissing..."
        className={buttonSecondarySm}
      >
        Dismiss
      </ActionButton>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  canEdit,
  hidden,
  children,
}: {
  suggestion: BrandSuggestion;
  canEdit: boolean;
  hidden: Hidden;
  children: React.ReactNode;
}) {
  return (
    <li className="grid gap-2 rounded-lg border border-line bg-surface p-4">
      {children}
      {suggestion.sourceUrl && (
        <a
          href={suggestion.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="justify-self-start text-xs text-accent hover:underline"
        >
          Source: {shortUrl(suggestion.sourceUrl)}
        </a>
      )}
      {canEdit && <SuggestionActions id={suggestion.id} hidden={hidden} />}
    </li>
  );
}

function ProfileSuggestion({
  suggestion,
  profile,
  canEdit,
  hidden,
}: {
  suggestion: BrandSuggestion;
  profile: BrandProfile | null;
  canEdit: boolean;
  hidden: Hidden;
}) {
  const field = suggestion.field ?? "";
  const suggested = valueLines(payloadValue(suggestion));
  const current = profile ? valueLines(profile[field as keyof BrandProfile]) : [];
  const addsToList = field === "targetLocations" || field === "usps" || field === "socialLinks";

  return (
    <SuggestionCard suggestion={suggestion} canEdit={canEdit} hidden={hidden}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{FIELD_LABEL[field] ?? field}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid content-start gap-1">
          <p className="text-xs text-muted">{addsToList ? "Adds" : "Suggested"}</p>
          <ul className="grid gap-1 text-sm">
            {suggested.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-1">
          <p className="text-xs text-muted">Currently</p>
          {current.length > 0 ? (
            <ul className="grid gap-1 text-sm text-muted">
              {current.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Empty</p>
          )}
        </div>
      </div>
    </SuggestionCard>
  );
}
