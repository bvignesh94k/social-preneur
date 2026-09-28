import { SOCIAL_PLATFORMS } from "@sp/core";
import type { Metadata } from "next";
import { Chip, SectionHeader } from "@/components/ui";
import { getAccountsWorkspace } from "@/data/accounts";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import { AccountAddForm, AccountEditForm } from "./account-form";
import { ConnectionCard } from "./connection-card";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ params, searchParams }: PageProps<"/c/[client]/accounts">) {
  const slug = (await params).client;
  const query = await searchParams;
  const { client, byPlatform, linkedin, facebook } = await getAccountsWorkspace(slug);

  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  // Platforms that can post on their own once connected.
  const connectable = {
    linkedin: {
      ...linkedin,
      connectHref: `/api/oauth/linkedin/connect?client=${slug}`,
      notConfiguredText:
        "LinkedIn is awaiting approval, so posts are prepared here and published by hand. Add the page below to keep this client’s details together.",
    },
    facebook: {
      ...facebook,
      connectHref: `/api/oauth/meta/connect?client=${slug}`,
      notConfiguredText:
        "Facebook is not switched on yet, so posts are prepared here and published by hand. Add the page below to keep this client’s details together.",
    },
  } as const;
  const live = (["linkedin", "facebook"] as const).filter((platform) => connectable[platform].configured);

  const results = (["linkedin", "facebook"] as const).map((platform) => ({
    platform,
    result: single(query[platform]),
  }));

  return (
    <div className="grid gap-6">
      <SectionHeader title="Accounts" description={`The pages and profiles Social Preneur manages for ${client.name}.`} />

      {results.map(({ platform, result }) =>
        result === "connected" ? (
          <p key={platform} role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-ink">
            Connected to {single(query.name)} on {SOCIAL_PLATFORM_LABEL[platform]}.
            {platform === "linkedin" &&
              single(query.multiple) &&
              ` You administer ${single(query.multiple)} LinkedIn Pages with this login; this is the first one found. Disconnect and remove the other admin roles in LinkedIn if this was not the right page, then reconnect.`}
          </p>
        ) : result === "error" ? (
          <p key={platform} role="alert" className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
            {single(query.reason) ?? `Something went wrong connecting to ${SOCIAL_PLATFORM_LABEL[platform]}.`}
          </p>
        ) : null,
      )}

      <div className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
        <p className="font-medium">
          {live.length > 0
            ? `${live.map((platform) => SOCIAL_PLATFORM_LABEL[platform]).join(" and ")} can post on their own once connected; the rest are assisted for now`
            : "Assisted mode until each platform approves this app"}
        </p>
        <p className="mt-1">
          Every other platform needs this application approved before it may publish on a client&apos;s behalf. Until
          then, its posts are prepared here and published by hand. Nothing is ever shown as published unless it truly
          was.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const account = byPlatform.get(platform);
          const editForm = account ? (
            <AccountEditForm
              slug={slug}
              platform={platform}
              account={{
                id: account.id,
                displayName: account.displayName,
                handle: account.handle ?? "",
                profileUrl: account.profileUrl ?? "",
              }}
            />
          ) : (
            <AccountAddForm slug={slug} platform={platform} clientName={client.name} />
          );

          if (platform === "linkedin" || platform === "facebook") {
            const oauth = connectable[platform];
            return (
              <section key={platform} className="grid gap-3 rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold">{SOCIAL_PLATFORM_LABEL[platform]}</h2>
                  {!oauth.configured && (
                    <Chip tone={account ? "info" : "neutral"}>{account ? "Assisted" : "Not added"}</Chip>
                  )}
                </div>
                <ConnectionCard
                  slug={slug}
                  platform={platform}
                  connectHref={oauth.connectHref}
                  configured={oauth.configured}
                  connected={oauth.connection}
                  notConfiguredText={oauth.notConfiguredText}
                />
                {!oauth.configured && editForm}
              </section>
            );
          }

          return (
            <section key={platform} className="grid gap-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold">{SOCIAL_PLATFORM_LABEL[platform]}</h2>
                {account ? <Chip tone="info">Assisted</Chip> : <Chip tone="neutral">Not added</Chip>}
              </div>
              {editForm}
            </section>
          );
        })}
      </div>
    </div>
  );
}
