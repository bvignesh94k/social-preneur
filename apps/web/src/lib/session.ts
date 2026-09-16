import "server-only";
import type { Actor } from "@sp/core";
import { findActiveMembership } from "@sp/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { getDb } from "./db";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface Workspace {
  user: SessionUser;
  actor: Actor;
  agency: { id: string; name: string; slug: string; timezone: string };
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
});

export const requireWorkspace = cache(async (): Promise<Workspace> => {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const membership = await findActiveMembership(await getDb(), user.id);
  if (!membership) redirect("/no-access");

  return {
    user,
    agency: membership.agency,
    actor: { userId: user.id, agencyId: membership.agency.id, agencyRole: membership.role },
  };
});
