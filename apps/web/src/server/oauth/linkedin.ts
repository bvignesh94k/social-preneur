// LinkedIn's versioned REST API. Verified live against Microsoft Learn's
// LinkedIn docs on 2026-09-17 rather than assumed from training memory, since
// LinkedIn retired the old /v2/ugcPosts surface for this one.
const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API_BASE = "https://api.linkedin.com/rest";
// LinkedIn-Version is a YYYYMM string; bump this occasionally, it does not
// need to track every release.
const LINKEDIN_VERSION = "202609";

// w_organization_social and rw_organization_admin sit behind LinkedIn's
// "Community Management API" product, requested from the app's Products tab
// and granted at a Development tier for pages the requesting member already
// administers - which is this app's exact situation, one agency posting only
// to pages it manages directly. Until that product is granted, LinkedIn's own
// authorize screen will refuse these scopes; nothing here can route around
// that; it is not a bug in this code.
export const LINKEDIN_SCOPES = ["openid", "profile", "w_organization_social", "rw_organization_admin"] as const;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface LinkedInOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: FetchLike;
}

export function buildAuthorizeUrl(config: Pick<LinkedInOAuthConfig, "clientId" | "redirectUri">, state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  return url.toString();
}

export class LinkedInApiError extends Error {
  constructor(
    readonly step: "token_exchange" | "list_organizations" | "organization_lookup",
    message: string,
  ) {
    super(message);
    this.name = "LinkedInApiError";
  }
}

export interface LinkedInTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
}

export async function exchangeCodeForToken(config: LinkedInOAuthConfig, code: string): Promise<LinkedInTokenResult> {
  const doFetch = config.fetch ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await doFetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !json.access_token) {
    throw new LinkedInApiError("token_exchange", json.error_description ?? json.error ?? `HTTP ${response.status}`);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 0) * 1000),
    scopes: json.scope ? json.scope.split(",") : [],
  };
}

function authedHeaders(accessToken: string): HeadersInit {
  return {
    authorization: `Bearer ${accessToken}`,
    "x-restli-protocol-version": "2.0.0",
    "linkedin-version": LINKEDIN_VERSION,
  };
}

export interface AdministeredOrganization {
  urn: string;
  id: string;
}

// Every Company Page the authorizing member is an approved ADMINISTRATOR of.
// A marketing agency's admin will typically see one page per client they have
// been added to, sometimes several if one LinkedIn login manages many.
export async function listAdministeredOrganizations(
  accessToken: string,
  doFetch: FetchLike = fetch,
): Promise<AdministeredOrganization[]> {
  const url = `${API_BASE}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`;
  const response = await doFetch(url, { headers: authedHeaders(accessToken) });
  const json = (await response.json().catch(() => ({}))) as {
    elements?: { organizationTarget?: string; organization?: string }[];
    message?: string;
  };

  if (!response.ok) {
    throw new LinkedInApiError("list_organizations", json.message ?? `HTTP ${response.status}`);
  }

  return (json.elements ?? [])
    .map((element) => element.organizationTarget ?? element.organization)
    .filter((urn): urn is string => Boolean(urn))
    .map((urn) => ({ urn, id: urn.split(":").pop() ?? urn }));
}

export async function getOrganizationName(
  accessToken: string,
  organizationId: string,
  doFetch: FetchLike = fetch,
): Promise<string> {
  const url = `${API_BASE}/organizations/${encodeURIComponent(organizationId)}`;
  const response = await doFetch(url, { headers: authedHeaders(accessToken) });
  const json = (await response.json().catch(() => ({}))) as {
    localizedName?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new LinkedInApiError("organization_lookup", json.message ?? `HTTP ${response.status}`);
  }

  return json.localizedName ?? `LinkedIn Page ${organizationId}`;
}
