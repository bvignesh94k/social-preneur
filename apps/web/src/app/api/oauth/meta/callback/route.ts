import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/lib/session";
import { MetaApiError, exchangeMetaCode } from "@/server/oauth/meta";
import { META_PICK_COOKIE, META_PICK_MAX_AGE_SECONDS, sealMetaPick } from "@/server/oauth/meta-pick";
import { verifyOAuthState } from "@/server/oauth/state";

function toAccounts(slug: string, params: Record<string, string>): NextResponse {
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
  if (!state || state.platform !== "facebook") {
    return NextResponse.json({ message: "This connection link expired or was tampered with. Try connecting again." }, { status: 400 });
  }

  if (providerError || !code) {
    return toAccounts(state.returnSlug, { facebook: "error", reason: providerError ?? "Facebook did not return a code." });
  }
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.TOKEN_ENCRYPTION_KEY) {
    return toAccounts(state.returnSlug, { facebook: "error", reason: "Facebook is not configured on the server." });
  }

  const { actor } = await requireWorkspace();
  const redirectUri = new URL("/api/oauth/meta/callback", env.BETTER_AUTH_URL).toString();

  let userToken: string;
  try {
    ({ userToken } = await exchangeMetaCode(
      { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, redirectUri },
      code,
    ));
  } catch (error) {
    const reason = error instanceof MetaApiError ? error.message : "Something went wrong connecting to Facebook.";
    return toAccounts(state.returnSlug, { facebook: "error", reason });
  }

  const response = NextResponse.redirect(new URL(`/c/${state.returnSlug}/accounts/facebook`, env.BETTER_AUTH_URL));
  response.cookies.set(
    META_PICK_COOKIE,
    sealMetaPick({ userToken, userId: actor.userId, clientId: state.clientId }, env.TOKEN_ENCRYPTION_KEY),
    {
      httpOnly: true,
      secure: env.BETTER_AUTH_URL.startsWith("https://"),
      sameSite: "lax",
      path: `/c/${state.returnSlug}/accounts`,
      maxAge: META_PICK_MAX_AGE_SECONDS,
    },
  );
  return response;
}
