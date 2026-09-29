import type { SocialPlatform } from "@sp/core";
import {
  claimDuePublishJobs,
  expireMissedPublishJobs,
  flagAccountForReconnect,
  listAccountsNeedingTokenRefresh,
  recordPublishFailure,
  recordPublishSuccess,
  recordTokenRefresh,
  recoverStalePublishJobs,
  type Database,
  type PublishJob,
} from "@sp/db";
import {
  LinkedInApiError,
  createOrganizationPost,
  formatLinkedInCommentary,
  linkedInPostUrl,
  type FetchLike,
} from "./oauth/linkedin";
import { MetaApiError, createPagePost, facebookPostUrl, formatFacebookMessage } from "./oauth/meta";
import { ThreadsApiError, createThreadsPost, formatThreadsText, refreshThreadsToken } from "./oauth/threads";
import { decryptToken, encryptToken } from "./oauth/token-crypto";

// Kept small so one run finishes well inside a serverless time limit; anything
// left over is picked up by the next run.
const BATCH_SIZE = 10;

const reconnect = (label: string) =>
  `Reconnect ${label} for this client on the Accounts tab, then retry the post.`;

const UNCLEAR = (label: string) =>
  `${label} did not give a clear answer, so it is not certain the post went out. Check the client's Page, and retry only if it is not there.`;

export interface PublishRunSummary {
  recovered: number;
  expired: number;
  claimed: number;
  published: number;
  retrying: number;
  failed: number;
}

interface Failure {
  message: string;
  retryable: boolean;
  reconnect: boolean;
}

interface Published {
  externalPostId: string | null;
  url: string | null;
}

type Outcome = Published | Failure;

// What each LinkedIn answer means for the post. Only answers that prove the
// post was NOT created are retried; anything ambiguous goes to a person, since
// posting twice on a client's page is worse than posting late.
export function classifyLinkedInError(error: LinkedInApiError): Failure {
  const { status } = error;
  if (status === 401) {
    return { message: `LinkedIn no longer accepts this connection. ${reconnect("LinkedIn")}`, retryable: false, reconnect: true };
  }
  if (status === 403) {
    return {
      message:
        "LinkedIn refused to post on this Page. Make sure the connected login is still an admin of the Page, reconnect LinkedIn on the Accounts tab, then retry the post.",
      retryable: false,
      reconnect: true,
    };
  }
  if (status === 429) {
    return { message: "LinkedIn's rate limit was reached. It will be tried again automatically.", retryable: true, reconnect: false };
  }
  if (status === 409 || status === 503) {
    return { message: "LinkedIn was busy. It will be tried again automatically.", retryable: true, reconnect: false };
  }
  if (status === null || status >= 500) {
    return { message: UNCLEAR("LinkedIn"), retryable: false, reconnect: false };
  }
  return { message: `LinkedIn rejected the post: ${error.message}`, retryable: false, reconnect: false };
}

// Graph API errors carry their meaning in the error code rather than the HTTP
// status. Same rule as LinkedIn: retry only when the post certainly was not made.
export function classifyMetaError(error: MetaApiError): Failure {
  const { code, status } = error;
  if (code === 190 || status === 401) {
    return { message: `Facebook no longer accepts this connection. ${reconnect("Facebook")}`, retryable: false, reconnect: true };
  }
  if (code === 10 || (code !== null && code >= 200 && code < 300) || status === 403) {
    return {
      message:
        "Facebook refused to post on this Page. Make sure the connected login can still create posts on it, reconnect Facebook on the Accounts tab, then retry the post.",
      retryable: false,
      reconnect: true,
    };
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80001) {
    return { message: "Facebook's rate limit was reached. It will be tried again automatically.", retryable: true, reconnect: false };
  }
  if (code === 506) {
    return { message: "Facebook refused this as a duplicate of a recent post on the Page.", retryable: false, reconnect: false };
  }
  if (status === null || status >= 500 || code === 1 || code === 2) {
    return { message: UNCLEAR("Facebook"), retryable: false, reconnect: false };
  }
  return { message: `Facebook rejected the post: ${error.message}`, retryable: false, reconnect: false };
}

// Graph API errors carry their meaning in the error code rather than the HTTP
// status, same as Facebook, since Threads runs on the same Graph infrastructure.
export function classifyThreadsError(error: ThreadsApiError): Failure {
  const { code, status } = error;
  if (code === 190 || status === 401) {
    return { message: `Threads no longer accepts this connection. ${reconnect("Threads")}`, retryable: false, reconnect: true };
  }
  if (code === 10 || (code !== null && code >= 200 && code < 300) || status === 403) {
    return {
      message: "Threads refused to post as this profile. Reconnect Threads on the Accounts tab, then retry the post.",
      retryable: false,
      reconnect: true,
    };
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80001) {
    return { message: "Threads' rate limit was reached. It will be tried again automatically.", retryable: true, reconnect: false };
  }
  if (error.step === "container_status" && /did not finish preparing/.test(error.message)) {
    return { message: "Threads took too long to prepare the post. It will be tried again automatically.", retryable: true, reconnect: false };
  }
  if (status === null || status >= 500 || code === 1 || code === 2) {
    return { message: UNCLEAR("Threads"), retryable: false, reconnect: false };
  }
  return { message: `Threads rejected the post: ${error.message}`, retryable: false, reconnect: false };
}

// Threads tokens expire after about 60 days and must be refreshed, unlike
// LinkedIn's or Facebook's. Run this well ahead of that: refreshing gives 60
// more days, and the publisher runs often enough that a wide window is cheap.
const THREADS_REFRESH_WINDOW_DAYS = 10;

async function refreshExpiringThreadsTokens(db: Database, encryptionKey: string, now: Date, fetchLike?: FetchLike): Promise<void> {
  const dueBefore = new Date(now.getTime() + THREADS_REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const accounts = await listAccountsNeedingTokenRefresh(db, "threads", now, dueBefore);

  for (const account of accounts) {
    let token: string;
    try {
      token = decryptToken(account.accessTokenEncrypted, encryptionKey);
    } catch {
      await flagAccountForReconnect(db, account.id, `The saved Threads connection could not be read. ${reconnect("Threads")}`);
      continue;
    }

    try {
      const refreshed = await refreshThreadsToken(token, fetchLike);
      await recordTokenRefresh(db, account.id, {
        accessTokenEncrypted: encryptToken(refreshed.accessToken, encryptionKey),
        tokenExpiresAt: refreshed.expiresAt,
      });
    } catch (error) {
      const failure = error instanceof ThreadsApiError ? classifyThreadsError(error) : null;
      if (failure?.reconnect) await flagAccountForReconnect(db, account.id, failure.message);
      // A retryable or unclassified failure is left for the next run's refresh
      // attempt; the token is still valid today, so nothing is blocked yet.
    }
  }
}

// The claim only hands over a version with no media or exactly one image.
function singleImage(job: PublishJob): string | null {
  const [first] = job.media;
  return first?.kind === "image" ? first.url : null;
}

function readToken(job: PublishJob, label: string, encryptionKey: string, now: Date): string | Failure {
  if (job.account.tokenExpiresAt && job.account.tokenExpiresAt <= now) {
    return { message: `The ${label} connection has expired. ${reconnect(label)}`, retryable: false, reconnect: true };
  }
  try {
    return decryptToken(job.account.accessTokenEncrypted, encryptionKey);
  } catch {
    return { message: `The saved ${label} connection could not be read. ${reconnect(label)}`, retryable: false, reconnect: true };
  }
}

// The loop every platform shares: clear up interrupted and late jobs, claim
// what is due, publish one at a time, and record each result.
async function runPlatform(
  db: Database,
  platform: SocialPlatform,
  now: Date,
  publishOne: (job: PublishJob) => Promise<Outcome>,
): Promise<PublishRunSummary> {
  const summary: PublishRunSummary = { recovered: 0, expired: 0, claimed: 0, published: 0, retrying: 0, failed: 0 };

  summary.recovered = await recoverStalePublishJobs(db, platform, now);
  summary.expired = await expireMissedPublishJobs(db, platform, now);

  const jobs = await claimDuePublishJobs(db, platform, now, BATCH_SIZE);
  summary.claimed = jobs.length;
  const flagged = new Set<string>();

  for (const job of jobs) {
    let result: Outcome;
    try {
      result = await publishOne(job);
    } catch {
      result = {
        message:
          "Something unexpected went wrong while publishing. Check the client's Page, and retry only if the post is not there.",
        retryable: false,
        reconnect: false,
      };
    }

    if ("externalPostId" in result) {
      await recordPublishSuccess(db, job.variantId, { ...result, at: new Date() });
      summary.published++;
      continue;
    }

    const outcome = await recordPublishFailure(db, job.variantId, result);
    if (outcome === "retrying") summary.retrying++;
    else summary.failed++;

    if (result.reconnect && !flagged.has(job.account.id)) {
      flagged.add(job.account.id);
      await flagAccountForReconnect(db, job.account.id, result.message);
    }
  }

  return summary;
}

export async function runLinkedInPublishing(
  db: Database,
  options: { encryptionKey: string; now?: Date; fetch?: FetchLike },
): Promise<PublishRunSummary> {
  const now = options.now ?? new Date();
  return runPlatform(db, "linkedin", now, async (job) => {
    const token = readToken(job, "LinkedIn", options.encryptionKey, now);
    if (typeof token !== "string") return token;
    try {
      const { postUrn } = await createOrganizationPost(
        token,
        {
          authorUrn: job.account.externalAccountId,
          commentary: formatLinkedInCommentary(job.caption, job.hashtags, job.linkUrl),
        },
        options.fetch,
      );
      return { externalPostId: postUrn, url: postUrn ? linkedInPostUrl(postUrn) : null };
    } catch (error) {
      if (error instanceof LinkedInApiError) return classifyLinkedInError(error);
      throw error;
    }
  });
}

export async function runFacebookPublishing(
  db: Database,
  options: { encryptionKey: string; appSecret: string; now?: Date; fetch?: FetchLike },
): Promise<PublishRunSummary> {
  const now = options.now ?? new Date();
  return runPlatform(db, "facebook", now, async (job) => {
    const token = readToken(job, "Facebook", options.encryptionKey, now);
    if (typeof token !== "string") return token;
    try {
      const { postId } = await createPagePost(
        token,
        options.appSecret,
        {
          pageId: job.account.externalAccountId,
          message: formatFacebookMessage(job.caption, job.hashtags),
          link: job.linkUrl,
          imageUrl: singleImage(job),
        },
        options.fetch,
      );
      return { externalPostId: postId, url: postId ? facebookPostUrl(postId) : null };
    } catch (error) {
      if (error instanceof MetaApiError) return classifyMetaError(error);
      throw error;
    }
  });
}

export async function runThreadsPublishing(
  db: Database,
  options: { encryptionKey: string; now?: Date; fetch?: FetchLike },
): Promise<PublishRunSummary> {
  const now = options.now ?? new Date();
  await refreshExpiringThreadsTokens(db, options.encryptionKey, now, options.fetch);

  return runPlatform(db, "threads", now, async (job) => {
    const token = readToken(job, "Threads", options.encryptionKey, now);
    if (typeof token !== "string") return token;
    try {
      const { postId, url } = await createThreadsPost(
        token,
        {
          userId: job.account.externalAccountId,
          text: formatThreadsText(job.caption, job.hashtags),
          imageUrl: singleImage(job),
        },
        options.fetch,
      );
      return { externalPostId: postId, url };
    } catch (error) {
      if (error instanceof ThreadsApiError) return classifyThreadsError(error);
      throw error;
    }
  });
}
