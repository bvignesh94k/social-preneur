import { requireClientBySlug } from "@sp/db";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/session";
import { buildThreadsAuthorizeUrl } from "@/server/oauth/threads";
import { createOAuthState } from "@/server/oauth/state";

export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get("client");
  if (!slug) return NextResponse.json({ message: "Missing client." }, { status: 400 });

  if (!env.THREADS_APP_ID || !env.THREADS_APP_SECRET || !env.TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json(
      { message: "Threads is not configured yet. Add THREADS_APP_ID, THREADS_APP_SECRET and TOKEN_ENCRYPTION_KEY." },
      { status: 503 },
    );
  }

  const { actor } = await requireWorkspace();
  const { client, scope } = await requireClientBySlug(await getDb(), actor, "accounts.connect", slug);

  const state = createOAuthState(
    { clientId: scope.clientId, platform: "threads", returnSlug: client.slug },
    env.BETTER_AUTH_SECRET,
  );
  const redirectUri = new URL("/api/oauth/threads/callback", env.BETTER_AUTH_URL).toString();
  return NextResponse.redirect(buildThreadsAuthorizeUrl({ appId: env.THREADS_APP_ID, redirectUri }, state));
}
