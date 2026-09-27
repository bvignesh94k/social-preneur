import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  createOrganizationPost,
  escapeLittleText,
  formatLinkedInCommentary,
  exchangeCodeForToken,
  getOrganizationName,
  LinkedInApiError,
  LINKEDIN_SCOPES,
  listAdministeredOrganizations,
} from "./linkedin";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("buildAuthorizeUrl", () => {
  it("includes every required OAuth parameter and the organization scopes", () => {
    const url = new URL(
      buildAuthorizeUrl(
        { clientId: "abc123", redirectUri: "https://socialpreneur.in/api/oauth/linkedin/callback" },
        "signed-state",
      ),
    );

    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("abc123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://socialpreneur.in/api/oauth/linkedin/callback");
    expect(url.searchParams.get("state")).toBe("signed-state");
    for (const scope of LINKEDIN_SCOPES) {
      expect(url.searchParams.get("scope")?.split(" ")).toContain(scope);
    }
  });
});

describe("exchangeCodeForToken", () => {
  const config = { clientId: "id", clientSecret: "secret", redirectUri: "https://example.com/cb" };

  it("parses a successful token response", async () => {
    const fetch = async () =>
      jsonResponse({ access_token: "tok_123", refresh_token: "ref_456", expires_in: 5_184_000, scope: "w_organization_social,rw_organization_admin" });

    const result = await exchangeCodeForToken({ ...config, fetch }, "auth-code");

    expect(result.accessToken).toBe("tok_123");
    expect(result.refreshToken).toBe("ref_456");
    expect(result.scopes).toEqual(["w_organization_social", "rw_organization_admin"]);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("treats a missing refresh token as null rather than throwing", async () => {
    const fetch = async () => jsonResponse({ access_token: "tok_123", expires_in: 3600 });
    const result = await exchangeCodeForToken({ ...config, fetch }, "auth-code");
    expect(result.refreshToken).toBeNull();
  });

  it("surfaces LinkedIn's own error description on failure", async () => {
    const fetch = async () => jsonResponse({ error: "invalid_grant", error_description: "The code has expired" }, 400);
    await expect(exchangeCodeForToken({ ...config, fetch }, "auth-code")).rejects.toMatchObject({
      step: "token_exchange",
      message: "The code has expired",
    });
  });
});

describe("listAdministeredOrganizations", () => {
  it("extracts organization URNs from the organizationAcls response", async () => {
    const fetch = async (url: string) => {
      expect(url).toContain("q=roleAssignee");
      expect(url).toContain("role=ADMINISTRATOR");
      return jsonResponse({
        elements: [
          { organizationTarget: "urn:li:organization:2414183", role: "ADMINISTRATOR" },
          { organizationTarget: "urn:li:organization:5515715", role: "ADMINISTRATOR" },
        ],
      });
    };

    const orgs = await listAdministeredOrganizations("tok_123", fetch);
    expect(orgs).toEqual([
      { urn: "urn:li:organization:2414183", id: "2414183" },
      { urn: "urn:li:organization:5515715", id: "5515715" },
    ]);
  });

  it("returns an empty list when the member administers nothing", async () => {
    const fetch = async () => jsonResponse({ elements: [] });
    expect(await listAdministeredOrganizations("tok_123", fetch)).toEqual([]);
  });

  it("throws with the real reason when LinkedIn refuses the call", async () => {
    const fetch = async () => jsonResponse({ message: "Not enough permissions to access: organizationAclFinder" }, 403);
    await expect(listAdministeredOrganizations("tok_123", fetch)).rejects.toMatchObject({
      step: "list_organizations",
      message: "Not enough permissions to access: organizationAclFinder",
    });
  });
});

describe("getOrganizationName", () => {
  it("reads localizedName from the organization lookup response", async () => {
    const fetch = async (url: string) => {
      expect(url).toContain("/rest/organizations/2414183");
      return jsonResponse({ id: 2414183, localizedName: "Kaveri Industrial Labels", vanityName: "kaveri-labels" });
    };

    expect(await getOrganizationName("tok_123", "2414183", fetch)).toBe("Kaveri Industrial Labels");
  });

  it("falls back to a generic name when localizedName is missing", async () => {
    const fetch = async () => jsonResponse({ id: 2414183 });
    expect(await getOrganizationName("tok_123", "2414183", fetch)).toBe("LinkedIn Page 2414183");
  });

  it("throws when the token no longer has admin access to that page", async () => {
    const fetch = async () =>
      jsonResponse({ message: "Viewer don't have permission to the ADMIN_ONLY VisibilityReduction" }, 403);
    await expect(getOrganizationName("tok_123", "2414183", fetch)).rejects.toBeInstanceOf(LinkedInApiError);
  });
});

describe("formatLinkedInCommentary", () => {
  it("escapes LinkedIn's reserved characters so captions stay plain text", () => {
    // Ends in one backslash, which must come out doubled.
    expect(escapeLittleText("Save 20% (limited) @ our store_1 [new] <b> *now* ~ | {x} \\")).toBe(
      String.raw`Save 20% \(limited\) \@ our store\_1 \[new\] \<b\> \*now\* \~ \| \{x\} \\`,
    );
  });

  it("keeps hashtags the writer typed as real hashtags, including Tamil", () => {
    expect(formatLinkedInCommentary("Labels that last #packaging (and more) #லேபிள்", [], null)).toBe(
      String.raw`Labels that last #packaging \(and more\) #லேபிள்`,
    );
  });

  it("does not treat numbers or C# as hashtags", () => {
    expect(formatLinkedInCommentary("Order #5 in C#", [], null)).toBe(String.raw`Order \#5 in C\#`);
  });

  it("adds the link and the version's hashtags on their own lines, without repeats", () => {
    expect(
      formatLinkedInCommentary("Read the guide #Labels", ["labels", "cold storage", "#shipping", "123"], "https://k.test/a_b"),
    ).toBe(["Read the guide #Labels", String.raw`https://k.test/a\_b`, "#coldstorage #shipping"].join("\n\n"));
  });

  it("does not repeat a link already in the caption", () => {
    expect(formatLinkedInCommentary("See https://k.test", [], "https://k.test")).toBe("See https://k.test");
  });
});

describe("createOrganizationPost", () => {
  it("sends a public text post as the Page and returns LinkedIn's post ID", async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const fetch = async (url: string, init?: RequestInit) => {
      request = { url, init };
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:99" } });
    };

    const result = await createOrganizationPost("tok", { authorUrn: "urn:li:organization:42", commentary: "Hello" }, fetch);

    expect(result).toEqual({ postUrn: "urn:li:share:99" });
    expect(request?.url).toBe("https://api.linkedin.com/rest/posts");
    expect(request?.init?.method).toBe("POST");
    const headers = request?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(headers["x-restli-protocol-version"]).toBe("2.0.0");
    expect(headers["linkedin-version"]).toMatch(/^\d{6}$/);
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      author: "urn:li:organization:42",
      commentary: "Hello",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    });
  });

  it("reports LinkedIn's status and message when it refuses", async () => {
    const fetch = async () => jsonResponse({ message: "Not enough permissions" }, 403);
    const error = await createOrganizationPost("tok", { authorUrn: "urn:li:organization:42", commentary: "x" }, fetch).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LinkedInApiError);
    expect(error).toMatchObject({ step: "create_post", status: 403, message: "Not enough permissions" });
  });

  it("reports no status when LinkedIn could not be reached", async () => {
    const fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const error = await createOrganizationPost("tok", { authorUrn: "urn:li:organization:42", commentary: "x" }, fetch).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ step: "create_post", status: null });
  });
});
