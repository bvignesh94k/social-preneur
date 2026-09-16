import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { lookup as dnsLookupAsync } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { isBlockedAddress } from "./ip";

const USER_AGENT = "SocialPreneurBot/1.0 (+https://socialpreneur.in)";
const PRIVATE_ADDRESS = "This address points to a private network and cannot be scanned.";

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

export class WebsiteFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteFetchError";
  }
}

export interface ResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  body: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> };
  } | null;
}

export type FetchImpl = (
  url: string,
  init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<ResponseLike>;

export type Resolver = (hostname: string) => Promise<string[]>;

export interface SafeFetchOptions {
  resolve?: Resolver;
  fetch?: FetchImpl;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowAnyPort?: boolean;
}

export interface FetchedDocument {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

const defaultResolver: Resolver = async (hostname) =>
  (await dnsLookupAsync(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

// Checks addresses again at connect time, so a DNS answer that changes after the first check cannot reach a private host.
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "");
    const list = addresses as unknown as LookupAddress[];
    if (list.length === 0 || list.some((entry) => isBlockedAddress(entry.address))) {
      return callback(new FetchBlockedError(PRIVATE_ADDRESS) as NodeJS.ErrnoException, "");
    }
    if (options.all) return callback(null, list);
    const first = list[0]!;
    callback(null, first.address, first.family);
  });
};

const guardedAgent = new Agent({ connect: { lookup: guardedLookup } });

const defaultFetch: FetchImpl = (url, init) =>
  undiciFetch(url, { ...init, dispatcher: guardedAgent }) as unknown as Promise<ResponseLike>;

export async function assertPublicUrl(url: URL, options: Pick<SafeFetchOptions, "resolve" | "allowAnyPort"> = {}) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchBlockedError("Only http and https addresses can be scanned.");
  }
  if (url.username || url.password) throw new FetchBlockedError("Addresses with login details cannot be scanned.");
  if (!options.allowAnyPort && url.port && url.port !== "80" && url.port !== "443") {
    throw new FetchBlockedError("Only standard web addresses can be scanned.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await (options.resolve ?? defaultResolver)(host);
    } catch {
      throw new WebsiteFetchError(`Could not find the website ${host}. Check the address.`);
    }
  }
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) throw new FetchBlockedError(PRIVATE_ADDRESS);
}

async function readLimited(response: ResponseLike, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

export async function safeFetchText(input: string, options: SafeFetchOptions = {}): Promise<FetchedDocument> {
  const doFetch = options.fetch ?? defaultFetch;
  let url = new URL(input);

  for (let redirects = 0; ; redirects++) {
    await assertPublicUrl(url, options);

    let response: ResponseLike;
    try {
      response = await doFetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        },
      });
    } catch (error) {
      const cause = (error as { cause?: unknown }).cause;
      if (cause instanceof FetchBlockedError) throw cause;
      if (error instanceof FetchBlockedError) throw error;
      throw new WebsiteFetchError(`Could not load ${url.hostname}. Check the address and try again.`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.getReader().cancel();
      if (!location || redirects >= (options.maxRedirects ?? 4)) {
        throw new WebsiteFetchError("The website redirected too many times.");
      }
      url = new URL(location, url);
      continue;
    }

    return {
      url: url.toString(),
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body: await readLimited(response, options.maxBytes ?? 2_000_000),
    };
  }
}
