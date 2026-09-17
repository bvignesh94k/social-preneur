import "server-only";
import { ForbiddenError, NotFoundError } from "@sp/core";
import { listSocialAccounts, requireClientBySlug } from "@sp/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/session";
import { toLinkedInView } from "@/server/oauth/linkedin-view";

export const getAccountsWorkspace = cache(async (slug: string) => {
  const { actor } = await requireWorkspace();
  const db = await getDb();

  let found: Awaited<ReturnType<typeof requireClientBySlug>>;
  try {
    found = await requireClientBySlug(db, actor, "accounts.connect", slug);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }

  const accounts = await listSocialAccounts(db, found.scope);
  const now = new Date();

  return {
    client: { id: found.client.id, name: found.client.name, slug: found.client.slug },
    byPlatform: new Map(accounts.map((account) => [account.platform, account])),
    linkedin: {
      configured: Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY),
      connection: (() => {
        const account = accounts.find((row) => row.platform === "linkedin");
        return account ? toLinkedInView(account, now) : null;
      })(),
    },
  };
});
