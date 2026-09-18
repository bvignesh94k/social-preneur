import { SOCIAL_PLATFORMS } from "@sp/core";
import type { Metadata } from "next";
import { Chip, SectionHeader } from "@/components/ui";
import { getAccountsWorkspace } from "@/data/accounts";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import { AccountAddForm, AccountEditForm } from "./account-form";
import { LinkedInCard } from "./linkedin-card";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ params, searchParams }: PageProps<"/c/[client]/accounts">) {
  const slug = (await params).client;
  const query = await searchParams;
  const { client, byPlatform, linkedin } = await getAccountsWorkspace(slug);

  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const linkedinResult = single(query.linkedin);

  return (
    <div className="grid gap-6">
      <SectionHeader title="Accounts" description={`The pages and profiles Social Preneur manages for ${client.name}.`} />

      {linkedinResult === "connected" && (
        <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          Connected to {single(query.name)} on LinkedIn.
          {single(query.multiple) &&
            ` You administer ${single(query.multiple)} LinkedIn Pages with this login; this is the first one found. Disconnect and remove the other admin roles in LinkedIn if this was not the right page, then reconnect.`}
        </p>
      )}
      {linkedinResult === "error" && (
        <p role="alert" className="rounded-lg bg-crit-soft px-4 py-3 text-sm text-crit">
          {single(query.reason) ?? "Something went wrong connecting to LinkedIn."}
        </p>
      )}

      <div className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
        <p className="font-medium">
          {linkedin.configured
            ? "LinkedIn connects for real; the rest are assisted for now"
            : "Assisted mode until each platform approves this app"}
        </p>
        <p className="mt-1">
          Facebook, Instagram, Threads, X and Pinterest each require this application to be reviewed before it may
          publish on their behalf. Until an account&apos;s review clears, its posts are prepared here and marked
          ready to post by hand. Nothing is ever shown as published unless it truly was.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const account = byPlatform.get(platform);

          if (platform === "linkedin") {
            return (
              <section key={platform} className="grid gap-3 rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold">{SOCIAL_PLATFORM_LABEL[platform]}</h2>
                  {!linkedin.configured && (
                    <Chip tone={account ? "info" : "neutral"}>{account ? "Assisted" : "Not added"}</Chip>
                  )}
                </div>
                <LinkedInCard slug={slug} configured={linkedin.configured} connected={linkedin.connection} />
                {!linkedin.configured &&
                  (account ? (
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
                    <AccountAddForm slug={slug} platform={platform} />
                  ))}
              </section>
            );
          }

          return (
            <section key={platform} className="grid gap-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold">{SOCIAL_PLATFORM_LABEL[platform]}</h2>
                {account ? (
                  <Chip tone={account.connectionMode === "automatic" ? "ok" : "info"}>
                    {account.connectionMode === "automatic" ? "Connected" : "Assisted"}
                  </Chip>
                ) : (
                  <Chip tone="neutral">Not added</Chip>
                )}
              </div>

              {account ? (
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
                <AccountAddForm slug={slug} platform={platform} />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
