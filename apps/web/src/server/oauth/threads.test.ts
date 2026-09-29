import { describe, expect, it } from "vitest";
import {
  THREADS_SCOPES,
  ThreadsApiError,
  buildThreadsAuthorizeUrl,
  createThreadsPost,
  exchangeThreadsCode,
  formatThreadsText,
  getThreadsProfile,
  refreshThreadsToken,
  threadsPostUrl,
} from "./threads";

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

describe("buildThreadsAuthorizeUrl", () => {
  it("asks for the publishing scopes on the threads.com dialog", () => {
    const url = new URL(buildThreadsAuthorizeUrl({ appId: "123", redirectUri: "https://socialpreneur.in/api/oauth/threads/callback" }, "signed"));
    expect(url.origin + url.pathname).toBe("https://threads.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://socialpreneur.in/api/oauth/threads/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("signed");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...THREADS_SCOPES]);
  });
});

describe("exchangeThreadsCode", () => {
  it("swaps the code for a user token on the .com host, then the long-lived one on .net", async () => {
    const { calls, fetch } = recorder([
      json({ access_token: "short", user_id: "u1", token_type: "bearer" }),
      json({ access_token: "long", token_type: "bearer", expires_in: 5_184_000 }),
    ]);

    const result = await exchangeThreadsCode({ appId: "123", appSecret: "s", redirectUri: "https://x.test/cb", fetch }, "code_1");

    expect(result).toMatchObject({ userToken: "long", userId: "u1" });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(calls[0]!.url.href).toBe("https://graph.threads.com/oauth/access_token");
    expect(calls[0]!.init?.method).toBe("POST");
    const body = new URLSearchParams(String(calls[0]!.init?.body));
    expect(Object.fromEntries(body)).toMatchObject({ client_id: "123", client_secret: "s", grant_type: "authorization_code", code: "code_1" });

    expect(calls[1]!.url.origin + calls[1]!.url.pathname).toBe("https://graph.threads.net/access_token");
    expect(calls[1]!.url.searchParams.get("grant_type")).toBe("th_exchange_token");
    expect(calls[1]!.url.searchParams.get("access_token")).toBe("short");
  });

  it("reports Threads' error message and code", async () => {
    const { fetch } = recorder([json({ error: { message: "Invalid verification code", code: 100 } }, 400)]);
    await expect(
      exchangeThreadsCode({ appId: "123", appSecret: "s", redirectUri: "https://x.test/cb", fetch }, "bad"),
    ).rejects.toMatchObject({ step: "token_exchange", message: "Invalid verification code", status: 400, code: 100 });
  });
});

describe("refreshThreadsToken", () => {
  it("sends only the token, never the app secret, to the .net refresh endpoint", async () => {
    const { calls, fetch } = recorder([json({ access_token: "refreshed", expires_in: 5_184_000 })]);
    const result = await refreshThreadsToken("old-token", fetch);

    expect(result).toMatchObject({ accessToken: "refreshed" });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(calls[0]!.url.origin + calls[0]!.url.pathname).toBe("https://graph.threads.net/refresh_access_token");
    expect(calls[0]!.url.searchParams.get("grant_type")).toBe("th_refresh_token");
    expect(calls[0]!.url.searchParams.get("access_token")).toBe("old-token");
    expect(calls[0]!.url.searchParams.has("client_secret")).toBe(false);
  });

  it("reports a revoked token as error code 190", async () => {
    const { fetch } = recorder([json({ error: { message: "Invalid OAuth 2.0 Access Token", code: 190 } }, 400)]);
    await expect(refreshThreadsToken("dead-token", fetch)).rejects.toMatchObject({ step: "refresh_token", code: 190 });
  });
});

describe("getThreadsProfile", () => {
  it("reads the connected profile's id and username", async () => {
    const { calls, fetch } = recorder([json({ id: "789", username: "kaveri_labels" })]);
    expect(await getThreadsProfile("tok", fetch)).toEqual({ id: "789", username: "kaveri_labels" });
    expect(calls[0]!.url.origin + calls[0]!.url.pathname).toBe("https://graph.threads.net/v1.0/me");
    expect(calls[0]!.url.searchParams.get("fields")).toBe("id,username");
  });
});

describe("createThreadsPost", () => {
  it("creates the container, waits for it, publishes, and reads back the permalink", async () => {
    const { calls, fetch } = recorder([
      json({ id: "container_1" }),
      json({ status: "IN_PROGRESS" }),
      json({ status: "FINISHED" }),
      json({ id: "media_1" }),
      json({ permalink: "https://www.threads.net/@kaveri_labels/post/abcdefg" }),
    ]);

    const result = await createThreadsPost("tok", { userId: "789", text: "Hello Threads" }, fetch);

    expect(result).toEqual({ postId: "media_1", url: "https://www.threads.net/@kaveri_labels/post/abcdefg" });
    expect(calls[0]!.url.origin + calls[0]!.url.pathname).toBe("https://graph.threads.net/v1.0/789/threads");
    const createBody = new URLSearchParams(String(calls[0]!.init?.body));
    expect(Object.fromEntries(createBody)).toMatchObject({ media_type: "TEXT", text: "Hello Threads" });
    expect(calls[3]!.url.origin + calls[3]!.url.pathname).toBe("https://graph.threads.net/v1.0/789/threads_publish");
    expect(new URLSearchParams(String(calls[3]!.init?.body)).get("creation_id")).toBe("container_1");
  }, 10_000);

  it("creates an image container when the post has an image", async () => {
    const { calls, fetch } = recorder([
      json({ id: "container_2" }),
      json({ status: "FINISHED" }),
      json({ id: "media_2" }),
      json({ permalink: "https://www.threads.net/@kaveri_labels/post/xyz" }),
    ]);

    await createThreadsPost("tok", { userId: "789", text: "Look", imageUrl: "https://blob.test/a.jpg" }, fetch);

    const createBody = new URLSearchParams(String(calls[0]!.init?.body));
    expect(Object.fromEntries(createBody)).toMatchObject({
      media_type: "IMAGE",
      image_url: "https://blob.test/a.jpg",
      text: "Look",
    });
  });

  it("fails when the container errors out instead of finishing", async () => {
    const { fetch } = recorder([json({ id: "container_2" }), json({ status: "ERROR", error_message: "Something went wrong" })]);
    const error = await createThreadsPost("tok", { userId: "789", text: "x" }, fetch).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ThreadsApiError);
    expect(error).toMatchObject({ step: "container_status", message: "Something went wrong" });
  });

  it("still returns the post as published when the permalink lookup fails", async () => {
    const { fetch } = recorder([
      json({ id: "container_3" }),
      json({ status: "FINISHED" }),
      json({ id: "media_3" }),
      json({ error: { message: "temporary", code: 2 } }, 500),
    ]);
    expect(await createThreadsPost("tok", { userId: "789", text: "x" }, fetch)).toEqual({ postId: "media_3", url: null });
  });

  it("reports no status when Threads could not be reached", async () => {
    const fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const error = await createThreadsPost("tok", { userId: "789", text: "x" }, fetch).catch((e: unknown) => e);
    expect(error).toMatchObject({ step: "create_container", status: null });
  });
});

describe("formatThreadsText", () => {
  it("adds hashtags the caption does not already mention", () => {
    expect(formatThreadsText("Cold storage tips #labels", ["labels", "packaging"])).toBe("Cold storage tips #labels\n\n#packaging");
  });

  it("keeps Threads text as written, with no escaping", () => {
    expect(formatThreadsText("Save 20% (today) @ our store_1", [])).toBe("Save 20% (today) @ our store_1");
  });
});

describe("threadsPostUrl", () => {
  it("builds a profile-scoped post link", () => {
    expect(threadsPostUrl("kaveri_labels", "abcdefg")).toBe("https://www.threads.net/@kaveri_labels/post/abcdefg");
  });
});
