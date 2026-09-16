import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  getAdminConfig,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  const config = getAdminConfig();
  if (!config) {
    return NextResponse.json(
      { message: "Admin login is not configured yet. Set ADMIN_EMAIL, ADMIN_PASSWORD_HASH and SESSION_SECRET." },
      { status: 503 },
    );
  }

  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ message: "Enter your email and password." }, { status: 400 });
  }

  const emailMatches = email.trim().toLowerCase() === config.email;
  const passwordMatches = verifyPassword(password, config.passwordHash);
  if (!emailMatches || !passwordMatches) {
    return NextResponse.json({ message: "That email and password do not match." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(config.email, config.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
