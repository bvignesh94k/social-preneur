import "server-only";
import { ForbiddenError, NotFoundError } from "@sp/core";
import { listSocialAccounts, requireClientBySlug } from "@sp/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/session";
import { toConnectionView } from "@/server/oauth/connection-view";

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
  const connectionFor = (platform: "linkedin" | "facebook" | "threads") => {
    const account = accounts.find((row) => row.platform === platform);
    return account ? toConnectionView(account, now) : null;
  };

  return {
    actor,
    scope: found.scope,
    client: { id: found.client.id, name: found.client.name, slug: found.client.slug },
    byPlatform: new Map(accounts.map((account) => [account.platform, account])),
    linkedin: {
      configured: Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY),
      connection: connectionFor("linkedin"),
    },
    facebook: {
      configured: Boolean(env.META_APP_ID && env.META_APP_SECRET && env.TOKEN_ENCRYPTION_KEY),
      connection: connectionFor("facebook"),
    },
    threads: {
      configured: Boolean(env.THREADS_APP_ID && env.THREADS_APP_SECRET && env.TOKEN_ENCRYPTION_KEY),
      connection: connectionFor("threads"),
    },
  };
});
