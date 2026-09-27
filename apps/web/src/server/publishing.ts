import {
  claimDuePublishJobs,
  expireMissedPublishJobs,
  flagAccountForReconnect,
  recordPublishFailure,
  recordPublishSuccess,
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
import { decryptToken } from "./oauth/token-crypto";

// Kept small so one run finishes well inside a serverless time limit; anything
// left over is picked up by the next run.
const BATCH_SIZE = 10;

const RECONNECT = "Reconnect LinkedIn for this client on the Accounts tab, then retry the post.";

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

// What each LinkedIn answer means for the post. Only answers that prove the
// post was NOT created are retried; anything ambiguous goes to a person, since
// posting twice on a client's page is worse than posting late.
export function classifyLinkedInError(error: LinkedInApiError): Failure {
  const { status } = error;
  if (status === 401) {
    return { message: `LinkedIn no longer accepts this connection. ${RECONNECT}`, retryable: false, reconnect: true };
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
    return {
      message:
        "LinkedIn did not give a clear answer, so it is not certain the post went out. Check the client's Page, and retry only if it is not there.",
      retryable: false,
      reconnect: false,
    };
  }
  return { message: `LinkedIn rejected the post: ${error.message}`, retryable: false, reconnect: false };
}

async function publishOne(
  job: PublishJob,
  options: { encryptionKey: string; now: Date; fetch?: FetchLike },
): Promise<{ postUrn: string | null } | Failure> {
  if (job.account.tokenExpiresAt && job.account.tokenExpiresAt <= options.now) {
    return { message: `The LinkedIn connection has expired. ${RECONNECT}`, retryable: false, reconnect: true };
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(job.account.accessTokenEncrypted, options.encryptionKey);
  } catch {
    return { message: `The saved LinkedIn connection could not be read. ${RECONNECT}`, retryable: false, reconnect: true };
  }

  try {
    return await createOrganizationPost(
      accessToken,
      {
        authorUrn: job.account.externalAccountId,
        commentary: formatLinkedInCommentary(job.caption, job.hashtags, job.linkUrl),
      },
      options.fetch,
    );
  } catch (error) {
    if (error instanceof LinkedInApiError) return classifyLinkedInError(error);
    throw error;
  }
}

export async function runLinkedInPublishing(
  db: Database,
  options: { encryptionKey: string; now?: Date; fetch?: FetchLike },
): Promise<PublishRunSummary> {
  const now = options.now ?? new Date();
  const summary: PublishRunSummary = { recovered: 0, expired: 0, claimed: 0, published: 0, retrying: 0, failed: 0 };

  summary.recovered = await recoverStalePublishJobs(db, "linkedin", now);
  summary.expired = await expireMissedPublishJobs(db, "linkedin", now);

  const jobs = await claimDuePublishJobs(db, "linkedin", now, BATCH_SIZE);
  summary.claimed = jobs.length;
  const flagged = new Set<string>();

  for (const job of jobs) {
    let result: Awaited<ReturnType<typeof publishOne>>;
    try {
      result = await publishOne(job, { ...options, now });
    } catch {
      result = {
        message:
          "Something unexpected went wrong while publishing. Check the client's Page, and retry only if the post is not there.",
        retryable: false,
        reconnect: false,
      };
    }

    if ("postUrn" in result) {
      await recordPublishSuccess(db, job.variantId, {
        externalPostId: result.postUrn,
        url: result.postUrn ? linkedInPostUrl(result.postUrn) : null,
        at: new Date(),
      });
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
