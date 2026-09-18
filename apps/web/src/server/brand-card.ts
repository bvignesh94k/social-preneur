import "server-only";
import {
  assembleBrandCard,
  BRAND_CARD_SYSTEM,
  BrandCardDraftSchema,
  brandCardInputHash,
  buildBrandCardPrompt,
  type BrandCard,
  type BrandCardInput,
} from "@sp/ai";
import { describeRule, InvalidInputError, type Actor } from "@sp/core";
import {
  getBrandCardSources,
  getClient,
  requireClientAccess,
  saveBrandCard,
  type BrandCardSources,
  type Client,
} from "@sp/db";
import { getDb } from "@/lib/db";
import { generateWithLogging } from "./ai";

export function toBrandCardInput(
  client: Pick<Client, "name" | "industry" | "defaultLanguage">,
  sources: BrandCardSources,
): BrandCardInput {
  const profile = sources.profile;
  return {
    clientName: client.name,
    industry: client.industry,
    contentLanguage: client.defaultLanguage,
    profile: {
      description: profile?.description ?? null,
      targetAudience: profile?.targetAudience ?? null,
      targetLocations: profile?.targetLocations ?? [],
      usps: profile?.usps ?? [],
      toneOfVoice: profile?.toneOfVoice ?? [],
      contentStyle: profile?.contentStyle ?? null,
      primaryCta: profile?.primaryCta ?? null,
      preferredHashtags: profile?.preferredHashtags ?? [],
      wordsToAvoid: profile?.wordsToAvoid ?? [],
    },
    offerings: sources.offerings.map(({ kind, name, summary, benefits }) => ({ kind, name, summary, benefits })),
    verifiedFacts: sources.verifiedFacts.map((fact) => fact.statement),
    rules: sources.activeRules.map((rule) => describeRule(rule.type, rule.value)),
  };
}

export async function generateBrandCard(actor: Actor, clientId: string): Promise<BrandCard> {
  const db = await getDb();
  const scope = await requireClientAccess(db, actor, "brand.edit", clientId);
  const [client, sources] = await Promise.all([getClient(db, scope), getBrandCardSources(db, scope)]);
  if (!sources.profile?.description) {
    throw new InvalidInputError("Add a business description to the brand profile before writing a summary.");
  }

  const input = toBrandCardInput(client, sources);
  const { data } = await generateWithLogging(
    { feature: "brand.card", agencyId: scope.agencyId, clientId: scope.clientId, userId: actor.userId },
    { system: BRAND_CARD_SYSTEM, prompt: buildBrandCardPrompt(input), schema: BrandCardDraftSchema },
  );

  const card = assembleBrandCard(data, input);
  await saveBrandCard(db, actor, clientId, { ...card }, brandCardInputHash(input));
  return card;
}
