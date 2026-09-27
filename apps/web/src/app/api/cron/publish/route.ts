import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { runLinkedInPublishing } from "@/server/publishing";

export const maxDuration = 60;

function authorized(request: Request, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Called on a schedule to publish whatever is due. Protected by a shared secret
// rather than a login, because the caller is a scheduler, not a person.
export async function GET(request: Request): Promise<Response> {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ message: "Publishing is not set up: CRON_SECRET is missing." }, { status: 503 });
  }
  if (!authorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ message: "Not allowed." }, { status: 401 });
  }
  if (!env.TOKEN_ENCRYPTION_KEY) {
    return NextResponse.json({ message: "Publishing is not set up: TOKEN_ENCRYPTION_KEY is missing." }, { status: 503 });
  }

  const linkedin = await runLinkedInPublishing(await getDb(), { encryptionKey: env.TOKEN_ENCRYPTION_KEY });
  return NextResponse.json({ linkedin });
}
