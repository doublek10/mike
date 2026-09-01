import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { titleSimilarity } from "@/lib/utils/hash";
import type { RawDocument } from "@/types";

const SIMILARITY_THRESHOLD = 0.6;
const LOOKBACK_HOURS = 72;

/**
 * §16 Deduplication engine.
 * Checks a candidate raw document against:
 *   1. exact content hash match
 *   2. exact source URL match
 *   3. title-similarity against recent raw documents
 * Returns the existing raw_document id if this is a duplicate, else null.
 *
 * NOTE: this dedupes at the raw-document level (same story, different
 * outlet). Grouping duplicates into a single Event happens later, in
 * lib/intelligence/build-event.ts, once the AI has read the content —
 * title-similarity alone is a pre-filter to avoid wasting AI calls, not
 * the final grouping decision.
 */
export async function findDuplicateRawDocument(
  candidate: Omit<RawDocument, "id">
): Promise<string | null> {
  const col = getAdminDb().collection(COLLECTIONS.RAW_DOCUMENTS);

  const hashMatch = await col
    .where("contentHash", "==", candidate.contentHash)
    .limit(1)
    .get();
  if (!hashMatch.empty) return hashMatch.docs[0].id;

  const urlMatch = await col
    .where("sourceUrl", "==", candidate.sourceUrl)
    .limit(1)
    .get();
  if (!urlMatch.empty) return urlMatch.docs[0].id;

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const recent = await col
    .where("collectedAt", ">=", cutoff)
    .limit(500)
    .get();

  for (const doc of recent.docs) {
    const existing = doc.data() as RawDocument;
    if (titleSimilarity(existing.title, candidate.title) >= SIMILARITY_THRESHOLD) {
      return doc.id;
    }
  }

  return null;
}
