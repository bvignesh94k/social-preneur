import "server-only";
import { isAllowed, NotFoundError } from "@sp/core";
import {
  getBrandProfile,
  hasAnyPost,
  hasContentMix,
  listClientMembers,
  listClientsForActor,
  listOfferings,
  listSocialAccounts,
  requireClientBySlug,
  type Client,
} from "@sp/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";

export interface ClientSummary {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  defaultLanguage: Client["defaultLanguage"];
  status: Client["status"];
  publishingPaused: boolean;
}

function toSummary(client: Client): ClientSummary {
  return {
    id: client.id,
    name: client.name,
    slug: client.slug,
    industry: client.industry,
    defaultLanguage: client.defaultLanguage,
    status: client.status,
    publishingPaused: client.publishingPausedAt !== null,
  };
}

export const getMyClients = cache(async (): Promise<ClientSummary[]> => {
  const { actor } = await requireWorkspace();
  const clients = await listClientsForActor(await getDb(), actor);
  return clients.map(toSummary);
});

export const getClientOverview = cache(async (slug: string) => {
  const { actor } = await requireWorkspace();
  const db = await getDb();

  let found: Awaited<ReturnType<typeof requireClientBySlug>>;
  try {
    found = await requireClientBySlug(db, actor, "client.view", slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { scope, client } = found;
  const target = { clientRole: scope.clientRole };
  const viewerIsClient = actor.agencyRole === "client_user";
  const canViewBrand = isAllowed(actor, "brand.view", target);

  const [members, profile, offerings, accounts, contentMixSet, anyPost] = await Promise.all([
    listClientMembers(db, scope),
    canViewBrand ? getBrandProfile(db, scope) : Promise.resolve(null),
    canViewBrand ? listOfferings(db, scope) : Promise.resolve([]),
    listSocialAccounts(db, scope),
    hasContentMix(db, scope),
    hasAnyPost(db, scope),
  ]);

  return {
    client: {
      ...toSummary(client),
      website: client.website,
      timezone: client.timezone,
      approvalMode: client.approvalMode,
      lateWindowMinutes: client.lateWindowMinutes,
    },
    members: members.map((m) => ({
      userId: m.userId,
      name: m.name,
      email: viewerIsClient ? null : m.email,
      role: m.role,
      agencyRole: m.agencyRole,
    })),
    brandReady:
      Boolean(profile?.description && profile.targetAudience) && offerings.some((o) => o.status === "active"),
    hasSocialAccounts: accounts.length > 0,
    hasContentMix: contentMixSet,
    hasAnyPost: anyPost,
    can: {
      pausePublishing: isAllowed(actor, "publishing.pauseClient", target),
      viewBrand: canViewBrand,
      viewCalendar: isAllowed(actor, "calendar.view", target),
      manageSettings: isAllowed(actor, "client.assignTeam", target),
      manageAccounts: isAllowed(actor, "accounts.connect", target),
      viewAccounts: isAllowed(actor, "accounts.connect", target),
      viewStrategy: isAllowed(actor, "strategy.edit", target),
    },
  };
});
