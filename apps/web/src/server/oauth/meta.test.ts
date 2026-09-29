import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  META_SCOPES,
  MetaApiError,
  appSecretProof,
  buildMetaAuthorizeUrl,
  createPagePost,
  exchangeMetaCode,
  facebookPostUrl,
  formatFacebookMessage,
  listManagedPages,
} from "./meta";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function recorder(responses: Response[]) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url: new URL(url), init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected call");
    return next;
  };
  return { calls, fetch };
}

describe("buildMetaAuthorizeUrl", () => {
  const base = { appId: "123", redirectUri: "https://socialpreneur.in/api/oauth/meta/callback" };

  it("asks for the Page permissions when there is no login configuration", () => {
    const url = new URL(buildMetaAuthorizeUrl(base, "signed"));
    expect(url.origin + url.pathname).toMatch(/^https:\/\/www\.facebook\.com\/v\d+\.\d+\/dialog\/oauth$/);
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe(base.redirectUri);
    expect(url.searchParams.get("state")).toBe("signed");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...META_SCOPES]);
    expect(url.searchParams.has("config_id")).toBe(false);
  });

  it("uses the login configuration instead of a scope list when one is set", () => {
    const url = new URL(buildMetaAuthorizeUrl({ ...base, configId: "cfg_9" }, "signed"));
    expect(url.searchParams.get("config_id")).toBe("cfg_9");
    expect(url.searchParams.has("scope")).toBe(false);
  });
});

describe("appSecretProof", () => {
  it("is the HMAC-SHA256 of the token keyed by the app secret", () => {
    expect(appSecretProof("tok", "secret")).toBe(createHmac("sha256", "secret").update("tok").digest("hex"));
  });
});

describe("exchangeMetaCode", () => {
  it("swaps the code for a user token, then for the long-lived one", async () => {
    const { calls, fetch } = recorder([
      json({ access_token: "short", token_type: "bearer", expires_in: 3600 }),
      json({ access_token: "long", token_type: "bearer", expires_in: 5_184_000 }),
    ]);

    const result = await exchangeMetaCode({ appId: "123", appSecret: "s", redirectUri: "https://x.test/cb", fetch }, "code_1");

    expect(result.userToken).toBe("long");
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(calls[0]!.url.pathname).toMatch(/\/oauth\/access_token$/);
    expect(calls[0]!.url.searchParams.get("code")).toBe("code_1");
    expect(calls[0]!.url.searchParams.get("redirect_uri")).toBe("https://x.test/cb");
    expect(calls[1]!.url.searchParams.get("grant_type")).toBe("fb_exchange_token");
    expect(calls[1]!.url.searchParams.get("fb_exchange_token")).toBe("short");
  });

  it("reports Facebook's error message and code", async () => {
    const { fetch } = recorder([json({ error: { message: "Invalid verification code", code: 100 } }, 400)]);
    await expect(
      exchangeMetaCode({ appId: "123", appSecret: "s", redirectUri: "https://x.test/cb", fetch }, "bad"),
    ).rejects.toMatchObject({ step: "token_exchange", message: "Invalid verification code", status: 400, code: 100 });
  });
});

describe("listManagedPages", () => {
  it("follows paging, keeps each Page's token, and flags Pages the login cannot post on", async () => {
    const { calls, fetch } = recorder([
      json({
        data: [{ id: "2", name: "Zeta Traders", access_token: "pt2", tasks: ["ANALYZE"] }],
        paging: { next: "https://graph.facebook.com/v25.0/me/accounts?after=abc&access_token=u" },
      }),
      json({ data: [{ id: "1", name: "Aruvi Clinics", access_token: "pt1", tasks: ["CREATE_CONTENT", "MANAGE"] }] }),
    ]);

    const pages = await listManagedPages("user-token", "secret", fetch);

    expect(pages).toEqual([
      { id: "1", name: "Aruvi Clinics", accessToken: "pt1", canPost: true },
      { id: "2", name: "Zeta Traders", accessToken: "pt2", canPost: false },
    ]);
    expect(calls[0]!.url.searchParams.get("appsecret_proof")).toBe(appSecretProof("user-token", "secret"));
    expect(calls[1]!.url.searchParams.get("after")).toBe("abc");
  });
});

describe("createPagePost", () => {
  it("posts the message and link to the Page feed, signed with the app secret", async () => {
    const { calls, fetch } = recorder([json({ id: "10_20" })]);

    const result = await createPagePost("page-token", "secret", { pageId: "10", message: "Hello", link: "https://k.test" }, fetch);

    expect(result).toEqual({ postId: "10_20" });
    expect(calls[0]!.url.pathname).toMatch(/\/10\/feed$/);
    expect(calls[0]!.init?.method).toBe("POST");
    const body = new URLSearchParams(String(calls[0]!.init?.body));
    expect(Object.fromEntries(body)).toEqual({
      message: "Hello",
      published: "true",
      access_token: "page-token",
      appsecret_proof: appSecretProof("page-token", "secret"),
      link: "https://k.test",
    });
  });

  it("posts a photo from its public address, with the link moved into the text", async () => {
    const { calls, fetch } = recorder([json({ id: "photo_9", post_id: "10_30" })]);

    const result = await createPagePost(
      "page-token",
      "secret",
      { pageId: "10", message: "New labels", link: "https://k.test", imageUrl: "https://blob.test/a.jpg" },
      fetch,
    );

    expect(result).toEqual({ postId: "10_30" });
    expect(calls[0]!.url.pathname).toMatch(/\/10\/photos$/);
    const body = new URLSearchParams(String(calls[0]!.init?.body));
    expect(body.get("url")).toBe("https://blob.test/a.jpg");
    expect(body.get("message")).toBe("New labels\n\nhttps://k.test");
    expect(body.has("link")).toBe(false);
  });

  it("leaves the link out when there is none", async () => {
    const { calls, fetch } = recorder([json({ id: "10_21" })]);
    await createPagePost("t", "s", { pageId: "10", message: "Hi", link: null }, fetch);
    expect(new URLSearchParams(String(calls[0]!.init?.body)).has("link")).toBe(false);
  });

  it("reports the Graph error code so the publisher can decide what to do", async () => {
    const { fetch } = recorder([json({ error: { message: "Error validating access token", code: 190 } }, 400)]);
    const error = await createPagePost("t", "s", { pageId: "10", message: "Hi", link: null }, fetch).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetaApiError);
    expect(error).toMatchObject({ step: "create_post", status: 400, code: 190 });
  });

  it("reports no status when Facebook could not be reached", async () => {
    const fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const error = await createPagePost("t", "s", { pageId: "10", message: "Hi", link: null }, fetch).catch((e: unknown) => e);
    expect(error).toMatchObject({ step: "create_post", status: null, code: null });
  });
});

describe("formatFacebookMessage", () => {
  it("adds the version's hashtags once, without repeating ones in the caption", () => {
    expect(formatFacebookMessage("Cold storage tips #labels", ["labels", "cold storage", "#packaging", "2026"])).toBe(
      "Cold storage tips #labels\n\n#coldstorage #packaging",
    );
  });

  it("keeps Facebook text as written, with no escaping", () => {
    expect(formatFacebookMessage("Save 20% (today) @ our store_1", [])).toBe("Save 20% (today) @ our store_1");
  });

  it("builds a link to the post", () => {
    expect(facebookPostUrl("10_20")).toBe("https://www.facebook.com/10_20");
  });
});
