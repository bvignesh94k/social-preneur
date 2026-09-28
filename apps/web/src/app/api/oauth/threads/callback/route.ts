import { saveOAuthConnection } from "@sp/db";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/session";
import { ThreadsApiError, THREADS_SCOPES, exchangeThreadsCode, getThreadsProfile } from "@/server/oauth/threads";
import { encryptToken } from "@/server/oauth/token-crypto";
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
  const providerError = params.get("error_description") ?? params.get("error_reason") ?? params.get("error");

  const state = stateToken ? verifyOAuthState(stateToken, env.BETTER_AUTH_SECRET) : null;
  if (!state || state.platform !== "threads") {
    return NextResponse.json({ message: "This connection link expired or was tampered with. Try connecting again." }, { status: 400 });
  }

  if (providerError || !code) {
    return backTo(state.returnSlug, { threads: "error", reason: providerError ?? "Threads did not return a code." });
  }
  if (!env.THREADS_APP_ID || !env.THREADS_APP_SECRET || !env.TOKEN_ENCRYPTION_KEY) {
    return backTo(state.returnSlug, { threads: "error", reason: "Threads is not configured on the server." });
  }

  const { actor } = await requireWorkspace();
  const redirectUri = new URL("/api/oauth/threads/callback", env.BETTER_AUTH_URL).toString();

  try {
    const { userToken, expiresAt } = await exchangeThreadsCode(
      { appId: env.THREADS_APP_ID, appSecret: env.THREADS_APP_SECRET, redirectUri },
      code,
    );
    const profile = await getThreadsProfile(userToken);

    await saveOAuthConnection(await getDb(), actor, state.clientId, "threads", {
      displayName: `@${profile.username}`,
      externalAccountId: profile.id,
      accessTokenEncrypted: encryptToken(userToken, env.TOKEN_ENCRYPTION_KEY),
      refreshTokenEncrypted: null,
      tokenExpiresAt: expiresAt,
      grantedScopes: [...THREADS_SCOPES],
    });

    return backTo(state.returnSlug, { threads: "connected", name: `@${profile.username}` });
  } catch (error) {
    const reason = error instanceof ThreadsApiError ? error.message : "Something went wrong connecting to Threads.";
    return backTo(state.returnSlug, { threads: "error", reason });
  }
}
