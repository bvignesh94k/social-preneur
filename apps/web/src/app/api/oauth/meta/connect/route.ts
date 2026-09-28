import { requireClientBySlug } from "@sp/db";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/session";
import { buildMetaAuthorizeUrl } from "@/server/oauth/meta";
import { createOAuthState } from "@/server/oauth/state";

export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get("client");
  if (!slug) return NextResponse.json({ message: "Missing client." }, { status: 400 });

  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json(
      { message: "Facebook is not configured yet. Add META_APP_ID, META_APP_SECRET and TOKEN_ENCRYPTION_KEY." },
      { status: 503 },
    );
  }

  const { actor } = await requireWorkspace();
  const { client, scope } = await requireClientBySlug(await getDb(), actor, "accounts.connect", slug);

  const state = createOAuthState(
    { clientId: scope.clientId, platform: "facebook", returnSlug: client.slug },
    env.BETTER_AUTH_SECRET,
  );
  const redirectUri = new URL("/api/oauth/meta/callback", env.BETTER_AUTH_URL).toString();
  return NextResponse.redirect(
    buildMetaAuthorizeUrl({ appId: env.META_APP_ID, redirectUri, configId: env.META_LOGIN_CONFIG_ID }, state),
  );
}
