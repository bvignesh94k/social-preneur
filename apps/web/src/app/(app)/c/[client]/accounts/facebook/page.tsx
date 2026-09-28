import { findAccountsConnectedElsewhere } from "@sp/db";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { SectionHeader, buttonSecondarySm } from "@/components/ui";
import { getAccountsWorkspace } from "@/data/accounts";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { MetaApiError, listManagedPages, type ManagedPage } from "@/server/oauth/meta";
import { META_PICK_COOKIE, openMetaPick } from "@/server/oauth/meta-pick";
import { FacebookPagePicker } from "./page-picker";

export const metadata: Metadata = { title: "Choose a Facebook Page" };

function Notice({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3">
      <p role="alert" className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
        {children}
      </p>
      <Link href={`/c/${slug}/accounts`} className={`${buttonSecondarySm} justify-self-start`}>
        Back to accounts
      </Link>
    </div>
  );
}

export default async function ChooseFacebookPage({ params }: PageProps<"/c/[client]/accounts/facebook">) {
  const slug = (await params).client;
  const { actor, scope, client } = await getAccountsWorkspace(slug);

  const header = (
    <SectionHeader
      title="Choose the Facebook Page"
      description={`Pick the Page that belongs to ${client.name}. Only this Page will be connected.`}
    />
  );

  if (!env.META_APP_SECRET || !env.TOKEN_ENCRYPTION_KEY) {
    return (
      <div className="grid gap-6">
        {header}
        <Notice slug={slug}>Facebook is not configured on the server.</Notice>
      </div>
    );
  }

  const pick = openMetaPick((await cookies()).get(META_PICK_COOKIE)?.value, env.TOKEN_ENCRYPTION_KEY, {
    userId: actor.userId,
    clientId: client.id,
  });
  if (!pick) {
    return (
      <div className="grid gap-6">
        {header}
        <Notice slug={slug}>This Facebook sign-in has expired or belongs to someone else. Connect Facebook again.</Notice>
      </div>
    );
  }

  let pages: ManagedPage[];
  try {
    pages = await listManagedPages(pick.userToken, env.META_APP_SECRET);
  } catch (error) {
    return (
      <div className="grid gap-6">
        {header}
        <Notice slug={slug}>
          Facebook did not return your Pages{error instanceof MetaApiError ? `: ${error.message}` : "."}
        </Notice>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="grid gap-6">
        {header}
        <Notice slug={slug}>
          No Facebook Pages came back for this login. Make sure you are an admin of {client.name}&rsquo;s Page and that
          you ticked it when Facebook asked which Pages to share, then connect again.
        </Notice>
      </div>
    );
  }

  const inUse = await findAccountsConnectedElsewhere(await getDb(), scope, "facebook", pages.map((page) => page.id));

  return (
    <div className="grid gap-6">
      {header}
      <FacebookPagePicker
        slug={slug}
        pages={pages.map((page) => ({
          id: page.id,
          name: page.name,
          canPost: page.canPost,
          inUseElsewhere: inUse.has(page.id),
        }))}
      />
      <Link href={`/c/${slug}/accounts`} className="text-sm text-muted underline underline-offset-2">
        Cancel
      </Link>
    </div>
  );
}
