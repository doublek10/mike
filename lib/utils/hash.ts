import { createHash } from "crypto";

/** Stable content hash used for exact-duplicate detection (§16). */
export function contentHash(input: string): string {
  return createHash("sha256").update(input.trim().toLowerCase()).digest("hex");
}

/**
 * Cheap title-similarity check for near-duplicate detection across sources
 * (§16). This is a pragmatic Jaccard-on-tokens heuristic — good enough to
 * catch "same story, different outlet" before anything reaches the AI.
 * Swap in an embeddings-based semantic-similarity check in lib/ai once you
 * have a vector store; the call site (dedupe.ts) will not need to change.
 */
export function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}
