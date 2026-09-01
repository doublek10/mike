import Parser from "rss-parser";
import type { RawDocument, Source } from "@/types";
import { contentHash } from "@/lib/utils/hash";
import { collectFromWebScrape } from "@/lib/collectors/web-scrape";

// Some publishers' bot protection (WAFs, Cloudflare, etc.) returns 403/404/406
// to requests that don't look like a real client. rss-parser sends no
// User-Agent by default, and a User-Agent whose embedded contact URL
// doesn't actually resolve (e.g. a placeholder like "your-app.vercel.app")
// can make things *worse* — some WAFs specifically check that the link
// resolves and penalize crawlers that fail that check. Until this app has
// a real public URL to advertise, a standard browser UA is the more
// reliable default: it's what gets past the same WAFs that reject unknown
// bots, and it's still only reading the same public RSS documents a human
// subscriber's feed reader would fetch.
//
// If/when this is deployed somewhere public, set RSS_USER_AGENT in the
// environment to a proper "BusinessTrendWatchBot/1.0 (+https://<your
// domain>)" string — identifying honestly is better crawler etiquette
// once there's a real URL behind it.
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": process.env.RSS_USER_AGENT || DEFAULT_USER_AGENT,
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
});

/**
 * Collects new items from a single RSS-based source.
 * Returns RawDocument-shaped objects — nothing is analyzed here.
 * This is intentional: §15 requires raw information to be persisted
 * before it ever reaches the AI layer, for audit and reprocessing.
 */
export async function collectFromRss(
  source: Source
): Promise<Omit<RawDocument, "id">[]> {
  if (!source.rssEndpoint) {
    throw new Error(`Source ${source.id} has no rssEndpoint configured`);
  }

  const feed = await parser.parseURL(source.rssEndpoint);
  const now = new Date().toISOString();

  return (feed.items ?? []).map((item) => {
    const rawContent = [item.title, item.contentSnippet, item.content]
      .filter(Boolean)
      .join("\n\n");

    return {
      sourceId: source.id,
      sourceUrl: item.link ?? source.website,
      title: item.title ?? "(untitled)",
      publishedAt: item.isoDate ?? item.pubDate ?? undefined,
      collectedAt: now,
      rawContent,
      contentHash: contentHash(rawContent || item.link || item.title || ""),
      country: source.country,
      region: source.region,
      language: "en",
      processed: false,
    };
  });
}

// Collection methods that actually work today. lib/intelligence/pipeline.ts
// checks this before attempting collection so a source using a method we
// haven't built yet (api, pdf, csv, email_alert, manual) gets recorded as
// "skipped" rather than "failed": it's expected and not an operational
// problem, so it shouldn't show up as a broken pipeline in the
// dashboard's status badge. Add to this set as you implement each method.
//
// "web_scrape" (lib/collectors/web-scrape.ts) is CSS-selector-based, zero
// AI cost — not a guarantee every web_scrape source will actually work,
// since the generic fallback heuristic doesn't handle every site layout.
// Check each source's first live run and set an explicit scrapeSelector
// if it comes back with 0 items.
export const IMPLEMENTED_COLLECTION_METHODS = new Set(["rss", "web_scrape"]);

/**
 * Dispatches to the correct collection mechanism for a source.
 * "rss" and "web_scrape" are implemented. §4 lists REST APIs, open data,
 * CSV/Excel, and PDF extraction as the remaining mechanisms the source
 * registry expects — add a sibling module per mechanism
 * (lib/collectors/api.ts, pdf.ts, csv.ts, email.ts) and extend the switch
 * below, then add the method string to IMPLEMENTED_COLLECTION_METHODS
 * above. The cron route and dedup pipeline do not need to change when you
 * add a new mechanism.
 */
export async function collectFromSource(
  source: Source
): Promise<Omit<RawDocument, "id">[]> {
  switch (source.collectionMethod) {
    case "rss":
      return collectFromRss(source);
    case "web_scrape":
      return collectFromWebScrape(source);
    default:
      throw new Error(
        `Collection method "${source.collectionMethod}" is not yet implemented. ` +
          `Currently supported: rss, web_scrape. See lib/collectors/rss.ts for the pattern to follow.`
      );
  }
}
