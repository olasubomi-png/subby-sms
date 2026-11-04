/**
 * Fetch free public shared numbers from ASMS.ai public HTML pages.
 * No paid API. Numbers come from published directory pages only.
 */

import { ASMS } from "./config";

export type AsmsPublicNumber = {
  /** E.164 with leading + */
  phone: string;
  /** Digits only (ASMS path segment) */
  digits: string;
  /** Official public inbox URL */
  inboxUrl: string;
};

export type AsmsCountry = {
  code: string;
  name: string;
  count: number;
};

export type AsmsFetchResult = {
  numbers: AsmsPublicNumber[];
  countries: AsmsCountry[];
  sourceUrl: string;
};

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 45_000;
const USER_AGENT = "SUBBY-SMS/1.0 (+https://subby-sms.vercel.app; public-directory reader)";

type CacheEntry = { at: number; data: AsmsFetchResult };

const cache = new Map<string, CacheEntry>();

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizePhone(name: string): string | null {
  const cleaned = name.replace(/[^\d+]/g, "");
  if (!/^\+\d{8,15}$/.test(cleaned)) return null;
  return cleaned;
}

function digitsFromPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function inboxUrl(digits: string): string {
  return `https://asms.ai/number/${digits}`;
}

function parseCountries(html: string): AsmsCountry[] {
  const found: AsmsCountry[] = [];
  const seen = new Set<string>();
  const re =
    /href="\/free-phone-numbers\?country=([a-z]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const code = m[1]!.toLowerCase();
    if (seen.has(code)) continue;
    const text = decodeHtml(m[2]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const countMatch = text.match(/(\d[\d,]*)\s*$/);
    const count = countMatch
      ? Number(countMatch[1]!.replace(/,/g, ""))
      : 0;
    if (!Number.isFinite(count) || count <= 0) continue;
    const name = text.replace(/\s*\d[\d,]*\s*$/, "").trim() || code.toUpperCase();
    seen.add(code);
    found.push({ code, name, count });
  }
  return found;
}

function parseNumbersFromJsonLd(html: string): AsmsPublicNumber[] {
  const numbers: AsmsPublicNumber[] = [];
  const seen = new Set<string>();
  const scriptRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(sm[1]!) as unknown;
      const lists: unknown[] = [];
      if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        if (obj["@type"] === "ItemList") lists.push(obj);
        if (Array.isArray(obj["@graph"])) lists.push(...obj["@graph"]);
      }
      for (const node of lists) {
        if (!node || typeof node !== "object") continue;
        const list = node as Record<string, unknown>;
        if (list["@type"] !== "ItemList") continue;
        const elements = list.itemListElement;
        if (!Array.isArray(elements)) continue;
        for (const el of elements) {
          if (!el || typeof el !== "object") continue;
          const item = el as Record<string, unknown>;
          const name = typeof item.name === "string" ? item.name : "";
          const phone = normalizePhone(name);
          if (!phone) continue;
          const digits = digitsFromPhone(phone);
          if (seen.has(digits)) continue;
          seen.add(digits);
          let url =
            typeof item.url === "string" && item.url.startsWith("http")
              ? item.url
              : inboxUrl(digits);
          numbers.push({ phone, digits, inboxUrl: url });
        }
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return numbers;
}

/** Fallback: /number/{digits} links in HTML */
function parseNumbersFromLinks(html: string): AsmsPublicNumber[] {
  const numbers: AsmsPublicNumber[] = [];
  const seen = new Set<string>();
  const re = /href="(?:https:\/\/asms\.ai)?\/number\/(\d{8,15})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const digits = m[1]!;
    if (seen.has(digits)) continue;
    seen.add(digits);
    numbers.push({
      phone: `+${digits}`,
      digits,
      inboxUrl: inboxUrl(digits),
    });
  }
  return numbers;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ASMS responded with HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function directoryUrl(countryCode?: string | null): string {
  const code = countryCode?.trim().toLowerCase();
  if (code && code !== "all") {
    return `${ASMS.numbers}?country=${encodeURIComponent(code)}`;
  }
  return ASMS.numbers;
}

/**
 * Load public free numbers from ASMS.ai HTML (with short in-memory cache).
 */
export async function fetchPublicNumbers(
  countryCode?: string | null
): Promise<AsmsFetchResult> {
  const code = countryCode?.trim().toLowerCase() || "all";
  const sourceUrl = directoryUrl(code === "all" ? null : code);
  const cached = cache.get(sourceUrl);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const html = await fetchHtml(sourceUrl);
  let numbers = parseNumbersFromJsonLd(html);
  if (numbers.length === 0) {
    numbers = parseNumbersFromLinks(html);
  }
  const countries = parseCountries(html);

  const data: AsmsFetchResult = { numbers, countries, sourceUrl };
  cache.set(sourceUrl, { at: Date.now(), data });
  return data;
}

export const PAGE_SIZE = 8;

export function paginateNumbers(
  numbers: AsmsPublicNumber[],
  page: number
): { slice: AsmsPublicNumber[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(numbers.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * PAGE_SIZE;
  return {
    slice: numbers.slice(start, start + PAGE_SIZE),
    page: safePage,
    totalPages,
  };
}

/** Flag / short label for known country codes */
export function countryLabel(code: string, name?: string): string {
  const flags: Record<string, string> = {
    uk: "🇬🇧",
    nl: "🇳🇱",
    fi: "🇫🇮",
    be: "🇧🇪",
    us: "🇺🇸",
    ge: "🇬🇪",
    se: "🇸🇪",
    fr: "🇫🇷",
    de: "🇩🇪",
    ua: "🇺🇦",
    au: "🇦🇺",
    ru: "🇷🇺",
    es: "🇪🇸",
    intl: "🌐",
  };
  const flag = flags[code] ?? "🌍";
  return `${flag} ${name ?? code.toUpperCase()}`;
}
