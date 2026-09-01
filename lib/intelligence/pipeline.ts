import { randomUUID } from "crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { collectFromSource, IMPLEMENTED_COLLECTION_METHODS } from "@/lib/collectors/rss";
import { findDuplicateRawDocument } from "@/lib/collectors/dedupe";
import { classifyRawDocument, CLASSIFY_PROMPT_VERSION } from "@/lib/ai/classify";
import { analyzeEventImpact, IMPACT_PROMPT_VERSION } from "@/lib/ai/analyze-impact";
import { generateDailyBrief } from "@/lib/ai/generate-brief";
import { ensureSourcesSeeded } from "@/lib/intelligence/seed";
import { runAggregation, type AggregationResult } from "@/lib/intelligence/aggregation";
import type { DailyBrief, Event, PipelineRun, RawDocument, Source, SourceRun } from "@/types";

// Audit-trail label for AI calls. Kept as one constant so it always matches
// whichever provider lib/ai/gemini.ts is actually calling — update this if
// you change GEMINI_MODEL or switch providers again.
const AI_MODEL_LABEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// ============================================================================
// STAGE 1 — COLLECT (§6, §44 /api/cron/collect)
// Pulls new items from every active source, dedupes at the raw level, and
// stores raw_documents. Never analyzes here — that is a separate cron step
// (§51 cost control: only relevant info gets expensive AI analysis).
// ============================================================================
export async function runCollectionForSource(source: Source): Promise<SourceRun> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const runRef = getAdminDb().collection(COLLECTIONS.SOURCE_RUNS).doc(runId);

  const run: SourceRun = {
    id: runId,
    sourceId: source.id,
    startedAt,
    status: "running",
    itemsFound: 0,
    itemsNew: 0,
  };
  await runRef.set(run);

  // Not a failure — this source is just waiting on a collector that
  // doesn't exist yet (see IMPLEMENTED_COLLECTION_METHODS). Recording it
  // as "failed" would make the dashboard's status badge cry wolf on every
  // single run for sources that were always going to do this.
  if (!IMPLEMENTED_COLLECTION_METHODS.has(source.collectionMethod)) {
    run.status = "skipped";
    run.error = `Collection method "${source.collectionMethod}" not implemented yet`;
    run.finishedAt = new Date().toISOString();
    await runRef.set(run);
    return run;
  }

  try {
    const items = await collectFromSource(source);
    run.itemsFound = items.length;

    for (const item of items) {
      const duplicateId = await findDuplicateRawDocument(item);
      if (duplicateId) continue;

      const docId = randomUUID();
      const raw: RawDocument = { id: docId, ...item };
      await getAdminDb().collection(COLLECTIONS.RAW_DOCUMENTS).doc(docId).set(raw);
      run.itemsNew++;
    }

    run.status = "success";
  } catch (err) {
    run.status = "failed";
    run.error = (err as Error).message;
    await getAdminDb().collection(COLLECTIONS.SOURCES).doc(source.id).update({
      lastFailure: new Date().toISOString(),
      lastFailureReason: run.error,
    });
  }

  run.finishedAt = new Date().toISOString();
  await runRef.set(run);

  if (run.status === "success") {
    await getAdminDb().collection(COLLECTIONS.SOURCES).doc(source.id).update({
      lastSuccessfulCollection: run.finishedAt,
    });
  }

  return run;
}

// ============================================================================
// STAGE 2 — CLASSIFY + ANALYZE (§18-21, §44 /api/cron/analyze)
// Reads unprocessed raw_documents, runs the two-stage AI pass, and writes a
// structured Event + an ai_analysis audit record for each stage. This is
// where §51 relevance filtering happens: irrelevant docs are marked
// processed but never become an Event.
// ============================================================================
export async function processUnanalyzedRawDocuments(limit = 20): Promise<{
  processed: number;
  eventsCreated: number;
  rejected: number;
}> {
  // Newest-collected first, not insertion order. With only 1 doc/run
  // analyzed (Gemini's free-tier 5 RPM leaves no headroom for more — see
  // lib/ai/gemini.ts), a backlog that built up over several days would
  // otherwise get worked through oldest-first, so the daily brief would
  // reflect whatever's been sitting queued longest rather than actually
  // current news. Trade-off: if new documents keep arriving faster than
  // they're analyzed, older backlog items could wait indefinitely — for a
  // trend-watching tool, stale news has fast-decaying value anyway, so
  // freshness wins here. collectedAt is always set (unlike publishedAt,
  // which some sources omit), so ordering by it never silently excludes
  // documents the way ordering by an optional field would.
  const snapshot = await getAdminDb()
    .collection(COLLECTIONS.RAW_DOCUMENTS)
    .where("processed", "==", false)
    .orderBy("collectedAt", "desc")
    .limit(limit)
    .get();

  let eventsCreated = 0;
  let rejected = 0;

  for (const docSnap of snapshot.docs) {
    const raw = docSnap.data() as RawDocument;

    try {
      const classification = await classifyRawDocument(raw);

      await getAdminDb().collection(COLLECTIONS.AI_ANALYSIS).add({
        id: randomUUID(),
        eventId: null,
        model: AI_MODEL_LABEL,
        promptVersion: CLASSIFY_PROMPT_VERSION,
        input: { rawDocumentId: raw.id },
        output: classification,
        confidence: null,
        createdAt: new Date().toISOString(),
      });

      if (!classification.relevantToSystem) {
        rejected++;
        await docSnap.ref.update({ processed: true });
        continue;
      }

      const impact = await analyzeEventImpact({
        title: classification.title,
        summary: classification.summary,
        what: classification.what,
        who: classification.who,
        where: classification.where,
        when: classification.when,
        whyItMatters: classification.whyItMatters,
        affectedSectors: classification.affectedSectors,
        affectedMarkets: classification.affectedMarkets,
        domains: classification.domains,
        country: classification.country,
        region: classification.region,
      });

      const eventId = randomUUID();
      const now = new Date().toISOString();

      // Resolve the source's display name once per doc (cheap — batch size
      // is already tiny given the Gemini rate limit) so EventCard can show
      // "Business Daily Africa" instead of a raw sourceId, and link
      // straight to the original article.
      const sourceDoc = await getAdminDb().collection(COLLECTIONS.SOURCES).doc(raw.sourceId).get();
      const sourceName = sourceDoc.exists ? (sourceDoc.data() as Source).name : raw.sourceId;

      const event: Event = {
        id: eventId,
        rawDocumentIds: [raw.id],
        sources: [{ sourceName, url: raw.sourceUrl }],
        title: classification.title,
        summary: classification.summary,
        eventType: classification.eventType,
        what: classification.what,
        who: classification.who,
        where: classification.where,
        when: classification.when,
        whyItMatters: classification.whyItMatters,
        affectedSectors: classification.affectedSectors,
        affectedMarkets: classification.affectedMarkets,
        relatedPolicies: classification.relatedPolicies,
        relatedCommodities: classification.relatedCommodities,
        relatedTradeRoutes: classification.relatedTradeRoutes,
        domains: classification.domains,
        country: classification.country,
        region: classification.region,
        entities: classification.entities.map((e) => ({
          type: e.type as Event["entities"][number]["type"],
          name: e.name,
        })),
        sourceTier: classification.sourceTierGuess,
        verified: classification.sourceTierGuess === "primary",
        impact: impact.impact,
        scores: impact.scores,
        businessImplication: impact.businessImplication,
        potentialRisks: impact.potentialRisks,
        potentialOpportunities: impact.potentialOpportunities,
        publishedAt: raw.publishedAt,
        collectedAt: raw.collectedAt,
        analyzedAt: now,
      };

      await getAdminDb().collection(COLLECTIONS.EVENTS).doc(eventId).set(event);

      await getAdminDb().collection(COLLECTIONS.AI_ANALYSIS).add({
        id: randomUUID(),
        eventId,
        model: AI_MODEL_LABEL,
        promptVersion: IMPACT_PROMPT_VERSION,
        input: { eventId },
        output: impact,
        confidence: impact.scores.confidence,
        createdAt: now,
      });

      await docSnap.ref.update({ processed: true });
      eventsCreated++;
    } catch (err) {
      // Leave `processed: false` so a failed doc is retried on the next run,
      // but log the failure so it is visible in Vercel function logs.
      console.error(`Failed to process raw document ${raw.id}:`, err);
    }
  }

  return { processed: snapshot.size, eventsCreated, rejected };
}

// ============================================================================
// STAGE 3 — DAILY BRIEF (§30, §44 /api/cron/briefings)
// Extracted here (rather than living only in the route handler) so both the
// standalone /api/cron/briefings route and the combined /api/cron/daily
// route can call the exact same logic — no duplicated brief-generation code
// to keep in sync between the two.
// ============================================================================
export async function runDailyBriefing(): Promise<
  { generated: false; message: string } | { generated: true; brief: DailyBrief }
> {
  const since = new Date();
  since.setHours(since.getHours() - 24);

  const snapshot = await getAdminDb()
    .collection(COLLECTIONS.EVENTS)
    .where("analyzedAt", ">=", since.toISOString())
    .orderBy("analyzedAt", "desc")
    .limit(100)
    .get();

  const events = snapshot.docs.map((d) => d.data() as Event);

  if (events.length === 0) {
    return { generated: false, message: "No analyzed events in the last 24h; brief not generated." };
  }

  const aiOutput = await generateDailyBrief(events);
  const dateId = new Date().toISOString().slice(0, 10);

  const brief: DailyBrief = {
    id: dateId,
    date: dateId,
    ...aiOutput,
    generatedAt: new Date().toISOString(),
  };

  await getAdminDb().collection(COLLECTIONS.DAILY_BRIEFS).doc(dateId).set(brief);

  return { generated: true, brief };
}

// ============================================================================
// COMBINED DAILY PIPELINE — auto-seed -> collect -> analyze -> brief
// Used by both /api/cron/daily (scheduled) and the dashboard's "Run
// pipeline now" button (a Server Action, see app/dashboard/actions.ts) —
// same code path either way, so what you trigger by hand behaves exactly
// like what the cron runs. Each step is wrapped so one step failing
// (e.g. a bad RSS feed) doesn't take down the whole run — you get a
// per-step result back either way, which is what actually lets you see
// *why* something didn't work instead of just "it didn't work."
// ============================================================================
export interface DailyPipelineResult {
  ranAt: string;
  seed: { seeded: boolean; created: number; updated: number } | { error: string };
  collect:
    | { sourcesRun: number; summary: { sourceId: string; sourceName: string; status: string; error?: string }[] }
    | { error: string };
  analyze: Awaited<ReturnType<typeof processUnanalyzedRawDocuments>> | { error: string };
  briefing: Awaited<ReturnType<typeof runDailyBriefing>> | { error: string };
  aggregation: AggregationResult | { error: string };
}

export async function runDailyPipeline(analyzeBatchSize: number): Promise<DailyPipelineResult> {
  const startedAt = new Date().toISOString();
  // Kept separate, not one flat array in push-order — a "failed" status
  // means one of these (seed/collect-itself/analyze/briefing threw), which
  // is a different, more urgent kind of problem than a single RSS source
  // 404ing (sourceErrors, "partial"). Combined at the end with hardErrors
  // first, so lastRun.errors[0] — what the status badge actually displays
  // — is always the thing that caused "failed", never masked by an
  // unrelated source hiccup that happened to run earlier in the pipeline.
  const hardErrors: string[] = [];
  const sourceErrors: string[] = [];

  const result: DailyPipelineResult = {
    ranAt: startedAt,
    seed: { seeded: false, created: 0, updated: 0 },
    collect: { sourcesRun: 0, summary: [] },
    analyze: { processed: 0, eventsCreated: 0, rejected: 0 },
    briefing: { generated: false, message: "not run" },
    aggregation: { sectorsUpdated: 0, risksUpdated: 0, opportunitiesUpdated: 0, trendsUpdated: 0 },
  };

  let sourcesFailed = 0;
  let sourcesSkipped = 0;

  // --- Step 0: auto-seed ---
  try {
    result.seed = await ensureSourcesSeeded();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.seed = { error: message };
    hardErrors.push(`seed: ${message}`);
    // If we can't even read/write the sources collection, nothing after
    // this will work either — record and return early.
    await recordPipelineRun({
      startedAt,
      result,
      sourcesFailed,
      sourcesSkipped,
      errors: [...hardErrors, ...sourceErrors],
    });
    return result;
  }

  // --- Step 1: collect ---
  let sources: Source[] = [];
  try {
    const sourcesSnapshot = await getAdminDb()
      .collection(COLLECTIONS.SOURCES)
      .where("active", "==", true)
      .get();
    sources = sourcesSnapshot.docs.map((d) => d.data() as Source);

    const collectResults = await Promise.allSettled(sources.map((source) => runCollectionForSource(source)));
    const summary = collectResults.map((r, i) => {
      // runCollectionForSource catches its own errors internally and
      // resolves with status "failed"/"skipped" rather than rejecting —
      // r.status is almost always "fulfilled" here. We still handle the
      // rejected branch defensively in case something upstream (e.g. the
      // Firestore write itself) throws instead.
      if (r.status === "fulfilled") {
        return {
          sourceId: sources[i].id,
          sourceName: sources[i].name,
          status: r.value.status,
          ...(r.value.error ? { error: r.value.error } : {}),
        };
      }
      return {
        sourceId: sources[i].id,
        sourceName: sources[i].name,
        status: "failed",
        error: String(r.reason),
      };
    });

    sourcesFailed = summary.filter((s) => s.status === "failed").length;
    sourcesSkipped = summary.filter((s) => s.status === "skipped").length;
    if (sourcesFailed > 0) {
      sourceErrors.push(...summary.filter((s) => s.status === "failed").map((s) => `${s.sourceName}: ${s.error}`));
    }

    result.collect = { sourcesRun: sources.length, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.collect = { error: message };
    hardErrors.push(`collect: ${message}`);
  }

  // --- Step 2: analyze ---
  try {
    result.analyze = await processUnanalyzedRawDocuments(analyzeBatchSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.analyze = { error: message };
    hardErrors.push(`analyze: ${message}`);
  }

  // --- Step 3: brief ---
  try {
    result.briefing = await runDailyBriefing();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.briefing = { error: message };
    hardErrors.push(`briefing: ${message}`);
  }

  // --- Step 4: aggregation (sectors/risks/opportunities/trends) ---
  // No AI calls — see lib/intelligence/aggregation.ts header. Runs even if
  // analyze or briefing failed above, since it only needs events that are
  // already in Firestore from any previous successful run, not anything
  // from this run specifically.
  try {
    result.aggregation = await runAggregation();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.aggregation = { error: message };
    hardErrors.push(`aggregation: ${message}`);
  }

  await recordPipelineRun({
    startedAt,
    result,
    sourcesFailed,
    sourcesSkipped,
    errors: [...hardErrors, ...sourceErrors],
  });
  return result;
}

// Writes the aggregate PipelineRun doc the dashboard status badge actually
// reads for "Last run" — see getSystemStatus() in lib/intelligence/queries.ts.
// Individual SourceRun docs (one per source, written by
// runCollectionForSource) remain available for per-source debugging, but
// are no longer what drives the top-level health signal.
async function recordPipelineRun(args: {
  startedAt: string;
  result: DailyPipelineResult;
  sourcesFailed: number;
  sourcesSkipped: number;
  errors: string[];
}): Promise<void> {
  const { startedAt, result, sourcesFailed, sourcesSkipped, errors } = args;

  const collectFailed = "error" in result.collect;
  const analyzeFailed = "error" in result.analyze;
  const briefingFailed = "error" in result.briefing;
  const seedFailed = "error" in result.seed;
  const aggregationFailed = "error" in result.aggregation;

  const anyHardFailure = seedFailed || collectFailed || analyzeFailed || briefingFailed || aggregationFailed;
  const anySourceFailure = sourcesFailed > 0;

  let status: PipelineRun["status"] = "success";
  if (anyHardFailure) status = "failed";
  else if (anySourceFailure) status = "partial";

  const run: PipelineRun = {
    id: randomUUID(),
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    seed: result.seed,
    sourcesRun: "sourcesRun" in result.collect ? result.collect.sourcesRun : 0,
    sourcesFailed,
    sourcesSkipped,
    docsAnalyzed: "processed" in result.analyze ? result.analyze.processed : 0,
    eventsCreated: "eventsCreated" in result.analyze ? result.analyze.eventsCreated : 0,
    briefingGenerated: "generated" in result.briefing ? result.briefing.generated : false,
    errors,
  };

  try {
    await getAdminDb().collection(COLLECTIONS.PIPELINE_RUNS).doc(run.id).set(run);
  } catch (err) {
    // Don't let a failure to write the run summary mask the pipeline's
    // actual results from the caller (the cron route / dashboard button).
    console.error("recordPipelineRun: failed to write pipeline_runs doc:", err);
  }
}
