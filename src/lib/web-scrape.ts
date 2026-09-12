// Server-only web scraping helpers.
// NOTE: this module imports node:dns/promises and must not be imported from
// client components. The pure extractUrls helper is the only function safe to
// duplicate on the client side.

import * as cheerio from "cheerio";
import type { AnyNode, Text } from "domhandler";
import { lookup } from "node:dns/promises";

export interface ScrapeResult {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
  truncatedFrom?: number;
}

export type ScrapeErrorCode = "invalid-url" | "ssrf-blocked" | "unsupported-content-type" | "timeout" | "fetch-failed";

export class ScrapeError extends Error {
  code: ScrapeErrorCode;

  constructor(code: ScrapeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const MAX_EXTRACTED_URLS = 3;
const URL_PATTERN = /https?:\/\/[^\s<>"'()\[\]]+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of matches) {
    const url = raw.replace(/[),.;:!?'"}\]]+$/, "");
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
    if (urls.length >= MAX_EXTRACTED_URLS) break;
  }
  return urls;
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part));
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8
    (a === 169 && b === 254) || // 169.254.0.0/16
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) // 192.168.0.0/16
  );
}

function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  const zoneIndex = addr.indexOf("%");
  if (zoneIndex !== -1) addr = addr.slice(0, zoneIndex);

  const v4Tail = addr.match(/^([0-9a-f:]*):(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4Tail) {
    const [h1, h2, h3, h4] = v4Tail.slice(2, 6).map((p) => Number.parseInt(p, 10));
    if ([h1, h2, h3, h4].some((n) => Number.isNaN(n) || n > 255)) return null;
    addr = `${v4Tail[1]}:${((h1 << 8) | h2).toString(16)}:${((h3 << 8) | h4).toString(16)}`;
  }

  if (!addr.includes(":")) return null;

  const doubleColonCount = (addr.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return null;

  let parts: string[];
  if (doubleColonCount === 1) {
    const [head, tail] = addr.split("::");
    const headParts = head ? head.split(":") : [];
    const tailParts = tail ? tail.split(":") : [];
    if (headParts.length + tailParts.length > 7) return null;
    parts = [...headParts, ...Array(8 - headParts.length - tailParts.length).fill("0"), ...tailParts];
  } else {
    parts = addr.split(":");
    if (parts.length !== 8) return null;
  }

  const hextets: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    hextets.push(Number.parseInt(part, 16));
  }
  return hextets;
}

function isPrivateIPv6(ip: string): boolean {
  const h = expandIPv6(ip);
  if (!h) return false;
  if (h.every((x) => x === 0)) return true; // Unspecified address.
  if (h[7] === 1 && h.slice(0, 7).every((x) => x === 0)) return true; // Loopback ::1.
  if (h[0] >= 0xfc00 && h[0] <= 0xfdff) return true; // Unique local fc00::/7.
  if (h[0] >= 0xfe80 && h[0] <= 0xfebf) return true; // Link-local fe80::/10.
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    // IPv4-mapped/compatible: ::ffff:a.b.c.d
    return isPrivateIPv4(`${(h[6] >> 8) & 0xff}.${h[6] & 0xff}.${(h[7] >> 8) & 0xff}.${h[7] & 0xff}`);
  }
  return false;
}

function isPrivateAddress(address: string): boolean {
  return address.includes(":") ? isPrivateIPv6(address) : isPrivateIPv4(address);
}

export function isDisallowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isIpLiteral(host)) return isPrivateAddress(host);
  return false;
}

const NOISE_SELECTOR = "script, style, nav, header, footer, aside, noscript, iframe, svg";

const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "tfoot",
  "thead",
  "tr",
  "ul",
]);

export function htmlToPlainText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  $(NOISE_SELECTOR).remove();
  const title = $("title").first().text().trim();

  const chunks: string[] = [];
  const walk = (nodes: cheerio.Cheerio<AnyNode>): void => {
    nodes.each((_index, node) => {
      if (node.type === "text") {
        chunks.push((node as Text).data);
      } else if (node.type === "tag") {
        const tag = $(node);
        if (BLOCK_ELEMENTS.has(node.name)) {
          chunks.push("\n");
          walk(tag.contents());
          chunks.push("\n");
        } else {
          walk(tag.contents());
        }
      }
    });
  };
  walk($("body"));

  const text = chunks
    .join("")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text };
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 50_000;

async function readCappedBody(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const slice = value.length <= MAX_BODY_BYTES - total ? value : value.slice(0, MAX_BODY_BYTES - total);
      chunks.push(slice);
      total += slice.length;
    }
    if (total >= MAX_BODY_BYTES) {
      await reader.cancel();
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function scrapeUrl(rawUrl: string): Promise<ScrapeResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ScrapeError("invalid-url", `Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ScrapeError("invalid-url", `URL must use the http or https protocol: ${rawUrl}`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isDisallowedHost(hostname)) {
    throw new ScrapeError("ssrf-blocked", `Blocked host: ${hostname}`);
  }
  if (!isIpLiteral(hostname)) {
    let resolved: { address: string; family: number }[];
    try {
      resolved = await lookup(hostname, { all: true });
    } catch (error) {
      throw new ScrapeError("fetch-failed", `Could not resolve host ${hostname}: ${(error as Error).message}`);
    }
    for (const { address } of resolved) {
      if (isPrivateAddress(address)) {
        throw new ScrapeError("ssrf-blocked", `Host ${hostname} resolves to a blocked address: ${address}`);
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ScrapeError("timeout", `Request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds`);
    }
    throw new ScrapeError("fetch-failed", `Failed to fetch URL: ${(error as Error).message}`);
  }

  if (response.status !== 200) {
    throw new ScrapeError("fetch-failed", `Request failed with status code: ${response.status}`);
  }

  const bodyBytes = await readCappedBody(response);
  let bodyText: string;
  try {
    bodyText = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
  } catch {
    throw new ScrapeError("unsupported-content-type", "Response content is not valid UTF-8");
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  let title = "";
  let content = bodyText;

  if (contentType.includes("text/html")) {
    const extracted = htmlToPlainText(bodyText);
    title = extracted.title;
    content = extracted.text;
  } else if (contentType.includes("application/json") || contentType.includes("text/json")) {
    try {
      content = JSON.stringify(JSON.parse(bodyText), null, 2);
    } catch {
      content = bodyText;
    }
  } else if (contentType.startsWith("text/")) {
    content = bodyText;
  } else {
    throw new ScrapeError("unsupported-content-type", `Content type not supported: ${contentType || "unknown"}`);
  }

  let truncated = false;
  let truncatedFrom: number | undefined;
  if (content.length > MAX_TEXT_CHARS) {
    truncatedFrom = content.length;
    content = content.slice(0, MAX_TEXT_CHARS);
    truncated = true;
  }

  return { url: parsed.toString(), title, text: content, truncated, truncatedFrom };
}
