import { requireClientBySlug } from "@sp/db";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/session";
import { buildAuthorizeUrl } from "@/server/oauth/linkedin";
import { createOAuthState } from "@/server/oauth/state";

export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get("client");
  if (!slug) return NextResponse.json({ message: "Missing client." }, { status: 400 });

  if (!env.LINKEDIN_CLIENT_ID || !env.TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json(
      { message: "LinkedIn is not configured yet. Add LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY." },
      { status: 503 },
    );
  }

  // Reuses accounts.connect: connecting through LinkedIn's login and typing an
  // account in by hand carry the same authority over the same client.
  const { actor } = await requireWorkspace();
  const { client, scope } = await requireClientBySlug(await getDb(), actor, "accounts.connect", slug);

  const state = createOAuthState(
    { clientId: scope.clientId, platform: "linkedin", returnSlug: client.slug },
    env.BETTER_AUTH_SECRET,
  );

  const redirectUri = new URL("/api/oauth/linkedin/callback", env.BETTER_AUTH_URL).toString();
  const authorizeUrl = buildAuthorizeUrl({ clientId: env.LINKEDIN_CLIENT_ID, redirectUri }, state);
  return NextResponse.redirect(authorizeUrl);
}
