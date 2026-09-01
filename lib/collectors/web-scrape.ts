import * as cheerio from "cheerio";
import type { RawDocument, Source } from "@/types";
import { contentHash } from "@/lib/utils/hash";

// Zero AI cost by design — see the header comment in
// lib/intelligence/aggregation.ts for why that matters given the
// account's tight Gemini quota (20 requests/day as of Aug 2026). This
// module is pure HTML parsing (Cheerio), same category of tool as
// rss-parser: it finds links, not meaning. An LLM-based scraper (fetch
// page -> ask Gemini to extract headlines) would generalize better across
// arbitrary site layouts, but costs 1 Gemini call per source per run,
// competing directly with the analyze step's already-scarce budget. If
// you want that trade-off for a specific handful of high-value sources,
// build it as a separate collectionMethod ("ai_web_scrape") so it stays
// an explicit, deliberate choice per source rather than a blanket default
// that silently eats your daily quota.

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Used when a source has no scrapeSelector configured (see types/index.ts).
// Looks for links that sit inside something that reads like a headline —
// a heading tag, or a common "title"/"headline"/"news" class name. This
// works on plenty of simple government/org listing pages, but is a
// heuristic, not a guarantee: sites using heavy JS rendering, unusual
// markup, or no semantic structure at all will likely return nothing or
// noise. Set scrapeSelector explicitly once you've checked the source's
// actual page structure — the generic fallback is a starting point, not
// a substitute for that.
const GENERIC_HEADLINE_SELECTOR =
  "h1 a[href], h2 a[href], h3 a[href], h4 a[href], " +
  "[class*='headline'] a[href], [class*='title'] a[href], " +
  "[class*='press-release'] a[href], [class*='news-item'] a[href]";

const MAX_ITEMS_PER_RUN = 20;

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/**
 * Collects headlines from a source's page via CSS selector (or the
 * generic fallback), no AI involved. Content is title + link only — most
 * listing pages don't show full article text, and fetching + parsing
 * every linked article page is a meaningfully bigger feature (readability
 * extraction, paywalls, wildly varying layouts) intentionally out of
 * scope here. This means scraped RawDocuments have thinner content than
 * RSS ones (which usually include a summary) — classify.ts/analyze-
 * impact.ts still work on a title alone, just with less to go on.
 */
export async function collectFromWebScrape(
  source: Source
): Promise<Omit<RawDocument, "id">[]> {
  const targetUrl = source.website;
  if (!targetUrl) {
    throw new Error(`Source ${source.id} has no website configured to scrape`);
  }

  const res = await fetch(targetUrl, {
    headers: {
      "User-Agent": process.env.RSS_USER_AGENT || DEFAULT_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Status code ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const selector = source.scrapeSelector || GENERIC_HEADLINE_SELECTOR;
  const seen = new Set<string>();
  const items: { title: string; url: string }[] = [];

  $(selector).each((_, el) => {
    if (items.length >= MAX_ITEMS_PER_RUN) return;
    const href = $(el).attr("href");
    const title = $(el).text().trim().replace(/\s+/g, " ");
    if (!href || !title || title.length < 8) return; // skip icon-only/empty links

    const resolved = resolveUrl(href, targetUrl);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    items.push({ title, url: resolved });
  });

  if (items.length === 0) {
    throw new Error(
      source.scrapeSelector
        ? `scrapeSelector "${source.scrapeSelector}" matched 0 items — check it against the live page`
        : `Generic headline heuristic matched 0 items — this source likely needs an explicit scrapeSelector (see types/index.ts)`
    );
  }

  const now = new Date().toISOString();

  return items.map(({ title, url }) => ({
    sourceId: source.id,
    sourceUrl: url,
    title,
    collectedAt: now,
    // No summary available from a listing page alone — see file header.
    rawContent: title,
    contentHash: contentHash(url || title),
    country: source.country,
    region: source.region,
    language: "en",
    processed: false,
  }));
}
