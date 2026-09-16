import { SOCIAL_PLATFORMS } from "@sp/core";
import { listSocialAccounts, requireClientBySlug } from "@sp/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chip, SectionHeader } from "@/components/ui";
import { getDb } from "@/lib/db";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/labels";
import { requireWorkspace } from "@/lib/session";
import { AccountAddForm, AccountEditForm } from "./account-form";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ params }: PageProps<"/c/[client]/accounts">) {
  const slug = (await params).client;
  const { actor } = await requireWorkspace();
  const db = await getDb();

  let found: Awaited<ReturnType<typeof requireClientBySlug>>;
  try {
    found = await requireClientBySlug(db, actor, "accounts.connect", slug);
  } catch {
    notFound();
  }

  const accounts = await listSocialAccounts(db, found.scope);
  const byPlatform = new Map(accounts.map((account) => [account.platform, account]));

  return (
    <div className="grid gap-6">
      <SectionHeader
        title="Accounts"
        description={`The pages and profiles Social Preneur manages for ${found.client.name}.`}
      />

      <div className="rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
        <p className="font-medium">Assisted mode until each platform approves this app</p>
        <p className="mt-1">
          Registering an account here does not connect it yet: Facebook, Instagram, Threads, LinkedIn, X and
          Pinterest each review this application before it may publish on their behalf, and that takes a few
          weeks. Until an account&apos;s review clears, its posts are prepared here and marked ready to post by hand.
          Nothing is ever shown as published unless it truly was.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const account = byPlatform.get(platform);

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
