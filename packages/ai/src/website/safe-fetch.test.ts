import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertPublicUrl, FetchBlockedError, safeFetchText, type FetchImpl } from "./safe-fetch";

const publicResolver = async () => ["93.184.216.34"];

describe("assertPublicUrl", () => {
  it.each([
    ["http://127.0.0.1/", "private network"],
    ["http://[::1]/", "private network"],
    ["http://169.254.169.254/latest/meta-data", "private network"],
    ["ftp://example.com/", "Only http and https"],
    ["https://user:secret@example.com/", "login details"],
    ["https://example.com:8080/", "standard web addresses"],
  ])("blocks %s", async (url, message) => {
    await expect(assertPublicUrl(new URL(url), { resolve: publicResolver })).rejects.toThrow(message);
  });

  it("blocks hostnames that resolve to private addresses", async () => {
    await expect(
      assertPublicUrl(new URL("https://intranet.example/"), { resolve: async () => ["10.0.0.5"] }),
    ).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("allows public hostnames", async () => {
    await expect(assertPublicUrl(new URL("https://example.com/"), { resolve: publicResolver })).resolves.toBeUndefined();
  });
});

describe("safeFetchText", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((_req, res) => res.end("internal secret"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("refuses to connect to a private host even when the first DNS check looked public", async () => {
    await expect(
      safeFetchText(`http://localhost:${port}/`, { resolve: publicResolver, allowAnyPort: true }),
    ).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("checks every redirect target", async () => {
    const fetch: FetchImpl = async () => ({
      status: 302,
      headers: { get: (name) => (name === "location" ? "http://127.0.0.1/admin" : null) },
      body: null,
    });
    await expect(safeFetchText("https://example.com/", { resolve: publicResolver, fetch })).rejects.toThrow(
      "private network",
    );
  });

  it("stops reading bodies beyond the size limit", async () => {
    const big = new TextEncoder().encode("a".repeat(1000));
    let sent = false;
    const fetch: FetchImpl = async () => ({
      status: 200,
      headers: { get: () => "text/html" },
      body: {
        getReader: () => ({
          read: async () => {
            if (sent) return { done: true };
            sent = true;
            return { done: false, value: big };
          },
          cancel: async () => {},
        }),
      },
    });
    const doc = await safeFetchText("https://example.com/", { resolve: publicResolver, fetch, maxBytes: 100 });
    expect(doc.body).toBe("");
  });
});
