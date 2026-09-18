import "server-only";
import {
  AiError,
  buildWebsiteAnalysisPrompt,
  cleanWebsiteAnalysis,
  crawlWebsite,
  FetchBlockedError,
  WEBSITE_ANALYSIS_SYSTEM,
  WebsiteAnalysisSchema,
  WebsiteFetchError,
} from "@sp/ai";
import {
  claimWebsiteScan,
  completeWebsiteScan,
  failWebsiteScan,
  getScanJobContext,
  suggestionsFromAnalysis,
} from "@sp/db";
import { getDb } from "@/lib/db";
import { generateWithLogging } from "./ai";

function scanErrorMessage(error: unknown): string {
  if (error instanceof FetchBlockedError || error instanceof WebsiteFetchError) return error.message;
  if (error instanceof AiError) return error.userMessage;
  console.error("Website scan failed", error);
  return "The scan stopped because of an unexpected problem. Try again.";
}

export async function runWebsiteScan(scanId: string): Promise<void> {
  const db = await getDb();
  const scan = await claimWebsiteScan(db, scanId);
  if (!scan) return;

  try {
    const context = await getScanJobContext(db, scan);
    const crawl = await crawlWebsite(scan.url, { maxPages: 15 });

    const { data } = await generateWithLogging(
      { feature: "brand.website_scan", agencyId: scan.agencyId, clientId: scan.clientId, userId: scan.startedBy },
      {
        system: WEBSITE_ANALYSIS_SYSTEM,
        prompt: buildWebsiteAnalysisPrompt({ clientName: context.clientName, pages: crawl.pages }),
        schema: WebsiteAnalysisSchema,
      },
    );

    const analysis = cleanWebsiteAnalysis(data, {
      pageUrls: crawl.pages.map((page) => page.url),
      existingOfferingNames: context.offeringNames,
    });
    const categories = new Map(analysis.pages.map((page) => [page.url, page]));

    await completeWebsiteScan(db, scan, {
      pages: crawl.pages.map((page) => ({
        url: page.url,
        title: page.title || null,
        category: categories.get(page.url)?.category ?? "other",
        summary: categories.get(page.url)?.summary ?? null,
      })),
      pagesSkipped: crawl.skipped.length,
      suggestions: suggestionsFromAnalysis(analysis, {
        profile: context.profile,
        factStatements: context.factStatements,
      }),
    });
  } catch (error) {
    await failWebsiteScan(db, scan.id, scanErrorMessage(error));
  }
}
