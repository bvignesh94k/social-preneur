import "server-only";
import { ForbiddenError, isAllowed, NotFoundError } from "@sp/core";
import { requireClientBySlug } from "@sp/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";

export const getBrandWorkspace = cache(async (slug: string) => {
  const { actor, agency } = await requireWorkspace();
  const db = await getDb();

  let found: Awaited<ReturnType<typeof requireClientBySlug>>;
  try {
    found = await requireClientBySlug(db, actor, "brand.view", slug);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }

  const target = { clientRole: found.scope.clientRole };
  return {
    db,
    scope: found.scope,
    actorId: actor.userId,
    timezone: agency.timezone,
    client: {
      id: found.client.id,
      name: found.client.name,
      slug: found.client.slug,
      website: found.client.website,
      industry: found.client.industry,
      defaultLanguage: found.client.defaultLanguage,
    },
    can: {
      edit: isAllowed(actor, "brand.edit", target),
      suggest: isAllowed(actor, "brand.suggest", target),
    },
  };
});
