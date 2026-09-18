import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, getAdminConfig } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL("/login?error=no_code", req.url));
    }

    const config = getAdminConfig();
    if (!config) {
      return NextResponse.redirect(new URL("/login?error=no_config", req.url));
    }

    const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(new URL("/login?error=missing_env", req.url));
    }

    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=authorization_code&code=${code}&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${redirectUri}`,
    });

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/login?error=token_failed", req.url));
    }

    const response = NextResponse.redirect(new URL("/dashboard", req.url));
    response.cookies.set(SESSION_COOKIE, createSessionToken(config.email, config.secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err) {
    console.error("LinkedIn callback error:", err);
    return NextResponse.redirect(new URL("/login?error=server_error", req.url));
  }
}
