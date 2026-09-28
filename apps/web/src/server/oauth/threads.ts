import { appendUnusedHashtags } from "./text";

// Endpoints verified live against Meta's Threads API docs on 2026-09-28, and
// against the endpoints themselves (each rejects an empty request with the
// error its documented required parameter would cause, confirming the host).
// Meta splits these across three hosts: the browser-facing authorize dialog,
// the short-lived code exchange, and everything else (long-lived exchange,
// refresh, and the versioned resource API).
const AUTHORIZE_URL = "https://threads.com/oauth/authorize";
const CODE_EXCHANGE_URL = "https://graph.threads.com/oauth/access_token";
const GRAPH = "https://graph.threads.net";
export const THREADS_GRAPH_VERSION = "v1.0";
const GRAPH_V1 = `${GRAPH}/${THREADS_GRAPH_VERSION}`;

export const THREADS_SCOPES = ["threads_basic", "threads_content_publish"] as const;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ThreadsApiError extends Error {
  constructor(
    readonly step:
      | "token_exchange"
      | "long_lived_token"
      | "refresh_token"
      | "get_profile"
      | "create_container"
      | "container_status"
      | "publish_container",
    message: string,
    // HTTP status and Graph error code, or null when no answer arrived.
    readonly status: number | null = null,
    readonly code: number | null = null,
  ) {
    super(message);
    this.name = "ThreadsApiError";
  }
}

interface GraphError {
  error?: { message?: string; code?: number };
}

async function call<T>(
  url: string,
  init: RequestInit | undefined,
  step: ThreadsApiError["step"],
  doFetch: FetchLike,
): Promise<T> {
  let response: Response;
  try {
    response = await doFetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new ThreadsApiError(step, error instanceof Error ? error.message : String(error));
  }
  const json = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok || json.error) {
    throw new ThreadsApiError(step, json.error?.message ?? `HTTP ${response.status}`, response.status, json.error?.code ?? null);
  }
  return json;
}

export function buildThreadsAuthorizeUrl(config: { appId: string; redirectUri: string }, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", THREADS_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

// Swaps the login code for a user token, then for the long-lived (about 60
// day) version. Unlike a Facebook Page token, this one expires and must be
// refreshed; see refreshThreadsToken.
export async function exchangeThreadsCode(
  config: { appId: string; appSecret: string; redirectUri: string; fetch?: FetchLike },
  code: string,
): Promise<{ userToken: string; userId: string; expiresAt: Date | null }> {
  const doFetch = config.fetch ?? fetch;
  const shortBody = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });
  const short = await call<{ access_token?: string; user_id?: string }>(
    CODE_EXCHANGE_URL,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: shortBody.toString() },
    "token_exchange",
    doFetch,
  );
  if (!short.access_token) throw new ThreadsApiError("token_exchange", "Threads did not return an access token.");

  const longUrl = new URL(`${GRAPH}/access_token`);
  longUrl.searchParams.set("grant_type", "th_exchange_token");
  longUrl.searchParams.set("client_secret", config.appSecret);
  longUrl.searchParams.set("access_token", short.access_token);
  const long = await call<{ access_token?: string; expires_in?: number }>(longUrl.toString(), undefined, "long_lived_token", doFetch);
  if (!long.access_token) throw new ThreadsApiError("long_lived_token", "Threads did not return a long-lived token.");

  return {
    userToken: long.access_token,
    userId: short.user_id ?? "",
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
  };
}

// Meta's refresh endpoint takes only the token, not the app secret. A token
// must be at least 24 hours old to refresh; the publisher runs this well
// before then, so that constraint is never hit in practice.
export async function refreshThreadsToken(
  accessToken: string,
  doFetch: FetchLike = fetch,
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const url = new URL(`${GRAPH}/refresh_access_token`);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const result = await call<{ access_token?: string; expires_in?: number }>(url.toString(), undefined, "refresh_token", doFetch);
  if (!result.access_token) throw new ThreadsApiError("refresh_token", "Threads did not return a refreshed token.");
  return {
    accessToken: result.access_token,
    expiresAt: result.expires_in ? new Date(Date.now() + result.expires_in * 1000) : null,
  };
}

export interface ThreadsProfile {
  id: string;
  username: string;
}

export async function getThreadsProfile(accessToken: string, doFetch: FetchLike = fetch): Promise<ThreadsProfile> {
  const url = new URL(`${GRAPH_V1}/me`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);
  const profile = await call<{ id?: string; username?: string }>(url.toString(), undefined, "get_profile", doFetch);
  if (!profile.id || !profile.username) throw new ThreadsApiError("get_profile", "Threads did not return a profile.");
  return { id: profile.id, username: profile.username };
}

export function formatThreadsText(caption: string, hashtags: string[]): string {
  return appendUnusedHashtags(caption, hashtags);
}

export function threadsPostUrl(username: string, shortcode: string): string {
  return `https://www.threads.net/@${username}/post/${shortcode}`;
}

// A container is checked for a short, bounded time rather than the
// documented "up to 5 minutes": that budget belongs to video processing, and
// a text container that is not ready within this window is more likely stuck
// than slow. Failing it lets the batch move on; retrying makes a fresh
// container, so an abandoned one just expires unused after 24 hours.
const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2_000;

// Creates a text container, waits for it to finish, publishes it, then reads
// back the permalink. The permalink read is best-effort: the post has
// already gone out by that point, so a failure there does not fail the post.
export async function createThreadsPost(
  accessToken: string,
  post: { userId: string; text: string },
  doFetch: FetchLike = fetch,
): Promise<{ postId: string | null; url: string | null }> {
  const createBody = new URLSearchParams({ media_type: "TEXT", text: post.text, access_token: accessToken });
  const container = await call<{ id?: string }>(
    `${GRAPH_V1}/${encodeURIComponent(post.userId)}/threads`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: createBody.toString() },
    "create_container",
    doFetch,
  );
  if (!container.id) throw new ThreadsApiError("create_container", "Threads did not return a container ID.");

  let ready = false;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const statusUrl = new URL(`${GRAPH_V1}/${encodeURIComponent(container.id)}`);
    statusUrl.searchParams.set("fields", "status,error_message");
    statusUrl.searchParams.set("access_token", accessToken);
    const status = await call<{ status?: string; error_message?: string }>(statusUrl.toString(), undefined, "container_status", doFetch);
    if (status.status === "FINISHED") {
      ready = true;
      break;
    }
    if (status.status === "ERROR" || status.status === "EXPIRED") {
      throw new ThreadsApiError("container_status", status.error_message ?? `Threads container ${status.status.toLowerCase()}.`);
    }
    if (attempt < POLL_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  if (!ready) throw new ThreadsApiError("container_status", "Threads did not finish preparing the post in time.");

  const publishBody = new URLSearchParams({ creation_id: container.id, access_token: accessToken });
  const published = await call<{ id?: string }>(
    `${GRAPH_V1}/${encodeURIComponent(post.userId)}/threads_publish`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: publishBody.toString() },
    "publish_container",
    doFetch,
  );
  if (!published.id) return { postId: null, url: null };

  let url: string | null = null;
  try {
    const permalinkUrl = new URL(`${GRAPH_V1}/${encodeURIComponent(published.id)}`);
    permalinkUrl.searchParams.set("fields", "permalink");
    permalinkUrl.searchParams.set("access_token", accessToken);
    const media = await call<{ permalink?: string }>(permalinkUrl.toString(), undefined, "container_status", doFetch);
    url = media.permalink ?? null;
  } catch {
    url = null;
  }

  return { postId: published.id, url };
}
