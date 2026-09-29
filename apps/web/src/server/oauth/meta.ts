import { createHmac } from "node:crypto";
import { appendUnusedHashtags } from "./text";

// Graph API version, verified against Meta's docs on 2026-09-28.
export const META_GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;

// pages_manage_posts depends on pages_read_engagement and pages_show_list.
// business_management lets Pages owned through a business portfolio show up.
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"] as const;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class MetaApiError extends Error {
  constructor(
    readonly step: "token_exchange" | "long_lived_token" | "list_pages" | "create_post",
    message: string,
    // HTTP status and Graph error code, or null when no answer arrived.
    readonly status: number | null = null,
    readonly code: number | null = null,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

interface GraphError {
  error?: { message?: string; code?: number };
}

// Facebook Login for Business prefers a configuration ID over a scope list;
// the scope list is the fallback until a configuration exists.
export function buildMetaAuthorizeUrl(
  config: { appId: string; redirectUri: string; configId?: string | null },
  state: string,
): string {
  const url = new URL(DIALOG);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (config.configId) url.searchParams.set("config_id", config.configId);
  else url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

// Proves each call comes from this app's server, so a leaked token alone is
// not enough to use it when "Require app secret" is switched on.
export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  step: MetaApiError["step"],
  doFetch: FetchLike,
): Promise<T> {
  const url = path.startsWith("https://") ? new URL(path) : new URL(`${GRAPH}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let response: Response;
  try {
    response = await doFetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new MetaApiError(step, error instanceof Error ? error.message : String(error));
  }
  const json = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok || json.error) {
    throw new MetaApiError(step, json.error?.message ?? `HTTP ${response.status}`, response.status, json.error?.code ?? null);
  }
  return json;
}

// Swaps the login code for a user token, then for the long-lived (about 60
// day) version, because Page tokens taken from a long-lived user token do not
// expire and short-lived ones last an hour.
export async function exchangeMetaCode(
  config: { appId: string; appSecret: string; redirectUri: string; fetch?: FetchLike },
  code: string,
): Promise<{ userToken: string; expiresAt: Date | null }> {
  const doFetch = config.fetch ?? fetch;
  const short = await graphGet<{ access_token?: string }>(
    "/oauth/access_token",
    { client_id: config.appId, client_secret: config.appSecret, redirect_uri: config.redirectUri, code },
    "token_exchange",
    doFetch,
  );
  if (!short.access_token) throw new MetaApiError("token_exchange", "Facebook did not return an access token.");

  const long = await graphGet<{ access_token?: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: short.access_token,
    },
    "long_lived_token",
    doFetch,
  );
  if (!long.access_token) throw new MetaApiError("long_lived_token", "Facebook did not return a long-lived token.");

  return {
    userToken: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
  };
}

export interface ManagedPage {
  id: string;
  name: string;
  accessToken: string;
  // Posting needs the CREATE_CONTENT task on the Page.
  canPost: boolean;
}

// Every Page the person manages. An agency login usually manages many client
// Pages, so the caller must let a person choose rather than take the first.
export async function listManagedPages(
  userToken: string,
  appSecret: string,
  doFetch: FetchLike = fetch,
): Promise<ManagedPage[]> {
  const pages: ManagedPage[] = [];
  let next: string | null = "/me/accounts";
  let params: Record<string, string> = {
    fields: "id,name,access_token,tasks",
    limit: "100",
    access_token: userToken,
    appsecret_proof: appSecretProof(userToken, appSecret),
  };

  for (let round = 0; next && round < 10; round++) {
    const page: {
      data?: { id: string; name: string; access_token?: string; tasks?: string[] }[];
      paging?: { next?: string };
    } = await graphGet(next, params, "list_pages", doFetch);

    for (const row of page.data ?? []) {
      if (!row.access_token) continue;
      pages.push({
        id: row.id,
        name: row.name,
        accessToken: row.access_token,
        canPost: row.tasks ? row.tasks.includes("CREATE_CONTENT") : true,
      });
    }
    // The next link already carries every parameter.
    next = page.paging?.next ?? null;
    params = {};
  }

  return pages.sort((a, b) => a.name.localeCompare(b.name));
}

export function formatFacebookMessage(caption: string, hashtags: string[]): string {
  return appendUnusedHashtags(caption, hashtags);
}

export function facebookPostUrl(postId: string): string {
  return `https://www.facebook.com/${postId}`;
}

// Publishes a post on the Page. A text post carries the link in its own field
// so Facebook shows a link preview instead of a bare address. A photo post has
// no link field, so the link goes at the end of the text instead; Facebook
// fetches the image from its public address.
export async function createPagePost(
  pageToken: string,
  appSecret: string,
  post: { pageId: string; message: string; link: string | null; imageUrl?: string | null },
  doFetch: FetchLike = fetch,
): Promise<{ postId: string | null }> {
  const photo = Boolean(post.imageUrl);
  const body = new URLSearchParams({
    message: photo && post.link && !post.message.includes(post.link) ? `${post.message}\n\n${post.link}` : post.message,
    published: "true",
    access_token: pageToken,
    appsecret_proof: appSecretProof(pageToken, appSecret),
  });
  if (photo) body.set("url", post.imageUrl!);
  else if (post.link) body.set("link", post.link);

  let response: Response;
  try {
    response = await doFetch(`${GRAPH}/${encodeURIComponent(post.pageId)}/${photo ? "photos" : "feed"}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new MetaApiError("create_post", error instanceof Error ? error.message : String(error));
  }

  const json = (await response.json().catch(() => ({}))) as { id?: string; post_id?: string } & GraphError;
  if (!response.ok || json.error) {
    throw new MetaApiError("create_post", json.error?.message ?? `HTTP ${response.status}`, response.status, json.error?.code ?? null);
  }
  // A photo answers with the photo ID and the ID of the post that shows it;
  // only the post ID opens as a post.
  return { postId: json.post_id ?? json.id ?? null };
}
