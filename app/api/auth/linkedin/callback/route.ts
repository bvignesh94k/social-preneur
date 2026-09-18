import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, getAdminConfig } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/login?error=" + error, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", request.url));
  }

  const config = getAdminConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/login?error=no_config", request.url));
  }

  try {
    const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID || "";
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || "";
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || "";

    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=authorization_code&code=${code}&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${redirectUri}`,
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL("/login?error=token_failed", request.url));
    }

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set(SESSION_COOKIE, createSessionToken(config.email, config.secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err) {
    console.error("Callback error:", err);
    return NextResponse.redirect(new URL("/login?error=server_error", request.url));
  }
}
