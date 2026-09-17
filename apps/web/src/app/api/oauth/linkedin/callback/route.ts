import { saveOAuthConnection } from "@sp/db";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/session";
import { encryptToken } from "@/server/oauth/token-crypto";
import {
  LinkedInApiError,
  exchangeCodeForToken,
  getOrganizationName,
  listAdministeredOrganizations,
} from "@/server/oauth/linkedin";
import { verifyOAuthState } from "@/server/oauth/state";

function backTo(slug: string, params: Record<string, string>): NextResponse {
  const url = new URL(`/c/${slug}/accounts`, env.BETTER_AUTH_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const stateToken = params.get("state");
  const code = params.get("code");
  const providerError = params.get("error_description") ?? params.get("error");

  const state = stateToken ? verifyOAuthState(stateToken, env.BETTER_AUTH_SECRET) : null;
  if (!state) {
    // No client to redirect back to without a verified state, so this is as
    // close to the source of the problem as the response can honestly get.
    return NextResponse.json({ message: "This connection link expired or was tampered with. Try connecting again." }, { status: 400 });
  }

  if (providerError || !code) {
    return backTo(state.returnSlug, { linkedin: "error", reason: providerError ?? "LinkedIn did not return a code." });
  }

  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET || !env.TOKEN_ENCRYPTION_KEY) {
    return backTo(state.returnSlug, { linkedin: "error", reason: "LinkedIn is not configured on the server." });
  }

  const { actor } = await requireWorkspace();
  const redirectUri = new URL("/api/oauth/linkedin/callback", env.BETTER_AUTH_URL).toString();

  try {
    const token = await exchangeCodeForToken(
      { clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET, redirectUri },
      code,
    );

    const organizations = await listAdministeredOrganizations(token.accessToken);
    if (organizations.length === 0) {
      return backTo(state.returnSlug, {
        linkedin: "error",
        reason:
          "No LinkedIn Page found where you are an administrator. Add yourself as an admin on the client's Page in LinkedIn first, then reconnect.",
      });
    }

    // Most agency logins administer exactly one page per client. When several
    // come back, the first is connected and named plainly so it is obvious
    // which one was picked, rather than building a chooser for a rare case.
    const chosen = organizations[0]!;
    const displayName = await getOrganizationName(token.accessToken, chosen.id);

    await saveOAuthConnection(await getDb(), actor, state.clientId, "linkedin", {
      displayName,
      externalAccountId: chosen.urn,
      accessTokenEncrypted: encryptToken(token.accessToken, env.TOKEN_ENCRYPTION_KEY),
      refreshTokenEncrypted: token.refreshToken ? encryptToken(token.refreshToken, env.TOKEN_ENCRYPTION_KEY) : null,
      tokenExpiresAt: token.expiresAt,
      grantedScopes: token.scopes,
    });

    return backTo(state.returnSlug, {
      linkedin: "connected",
      name: displayName,
      ...(organizations.length > 1 ? { multiple: String(organizations.length) } : {}),
    });
  } catch (error) {
    const reason = error instanceof LinkedInApiError ? error.message : "Something went wrong connecting to LinkedIn.";
    return backTo(state.returnSlug, { linkedin: "error", reason });
  }
}
