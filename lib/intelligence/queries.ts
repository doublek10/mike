import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { Domain, Event, DailyBrief, PipelineRun, Source } from "@/types";

export async function getRecentEvents(opts: { domain?: Domain; limit?: number } = {}): Promise<Event[]> {
  const limit = opts.limit ?? 30;
  try {
    let query = getAdminDb().collection(COLLECTIONS.EVENTS).orderBy("analyzedAt", "desc").limit(limit);
    if (opts.domain) {
      // where(domains array-contains) + orderBy(analyzedAt) needs a
      // composite index — see firestore.indexes.json. Without it this
      // throws FAILED_PRECONDITION, which used to be swallowed silently
      // below and made every domain-filtered page (Kenya, Regional,
      // Global, Trade, Labour) look like it had no data at all, even with
      // real events in Firestore. Logging it now so that's visible instead
      // of looking identical to "genuinely no events yet."
      query = getAdminDb()
        .collection(COLLECTIONS.EVENTS)
        .where("domains", "array-contains", opts.domain)
        .orderBy("analyzedAt", "desc")
        .limit(limit) as typeof query;
    }
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as Event);
  } catch (err) {
    console.error(`getRecentEvents(domain=${opts.domain ?? "none"}): query failed:`, err);
    return [];
  }
}

export async function getTodaysBrief(): Promise<DailyBrief | null> {
  try {
    const dateId = new Date().toISOString().slice(0, 10);
    const doc = await getAdminDb().collection(COLLECTIONS.DAILY_BRIEFS).doc(dateId).get();
    return doc.exists ? (doc.data() as DailyBrief) : null;
  } catch (err) {
    console.error("getTodaysBrief: query failed:", err);
    return null;
  }
}

export async function getSources(): Promise<Source[]> {
  try {
    const snap = await getAdminDb().collection(COLLECTIONS.SOURCES).get();
    return snap.docs.map((d) => d.data() as Source);
  } catch (err) {
    console.error("getSources: query failed:", err);
    return [];
  }
}

// ============================================================================
// System status — powers the health badge in the dashboard header. Checks
// the things that actually cause an empty dashboard: unseeded sources, a
// missing AI key, the pipeline never having run, or the last run failing/
// going stale. Doesn't try to catch everything — just the common causes.
// ============================================================================
export type SystemStatusLevel = "ok" | "warning" | "error";

export interface SystemStatus {
  level: SystemStatusLevel;
  headline: string;
  detail: string;
  env: {
    name: string;
    set: boolean;
  }[];
  stats: {
    sourcesActive: number;
    sourcesTotal: number;
    docsPendingAnalysis: number;
    eventsTotal: number;
    lastRunAt: string | null;
    lastRunStatus: PipelineRun["status"] | null;
    lastRunErrors: string[];
    lastBriefDate: string | null;
    geminiConfigured: boolean;
  };
}

// Checked directly against process.env, not inferred from whether a call
// succeeded — this is the difference between "Firestore didn't work" and
// "here is specifically which variable Node can't see." Only presence is
// reported, never values, so this is safe to render in the browser.
function checkEnv() {
  const required = [
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "GEMINI_API_KEY",
  ];
  return required.map((name) => ({ name, set: Boolean(process.env[name]) }));
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const env = checkEnv();

  const adminProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const projectIdMismatch = Boolean(adminProjectId && clientProjectId && adminProjectId !== clientProjectId);

  let sourcesTotal = 0;
  let sourcesActive = 0;
  let docsPendingAnalysis = 0;
  let eventsTotal = 0;
  let lastRun: PipelineRun | null = null;
  let lastBriefDate: string | null = null;
  let firestoreError: string | null = null;

  try {
    const sourcesSnap = await getAdminDb().collection(COLLECTIONS.SOURCES).get();
    sourcesTotal = sourcesSnap.size;
    sourcesActive = sourcesSnap.docs.filter((d) => (d.data() as Source).active).length;

    const [pendingCount, eventsCount, lastRunSnap, lastBriefSnap] = await Promise.all([
      getAdminDb().collection(COLLECTIONS.RAW_DOCUMENTS).where("processed", "==", false).count().get(),
      getAdminDb().collection(COLLECTIONS.EVENTS).count().get(),
      getAdminDb().collection(COLLECTIONS.PIPELINE_RUNS).orderBy("startedAt", "desc").limit(1).get(),
      getAdminDb().collection(COLLECTIONS.DAILY_BRIEFS).orderBy("date", "desc").limit(1).get(),
    ]);

    docsPendingAnalysis = pendingCount.data().count;
    eventsTotal = eventsCount.data().count;
    lastRun = lastRunSnap.empty ? null : (lastRunSnap.docs[0].data() as PipelineRun);
    lastBriefDate = lastBriefSnap.empty ? null : (lastBriefSnap.docs[0].data() as DailyBrief).date;
  } catch (err) {
    // Surface the actual error text in the UI, not just a generic message.
    // Firebase Admin/gRPC error messages don't contain your credential
    // values, so this is safe to show — it's exactly what would otherwise
    // only show up in your terminal or Vercel function logs.
    firestoreError = err instanceof Error ? err.message : String(err);
    console.error("getSystemStatus: Firestore check failed:", err);
  }

  const stats = {
    sourcesActive,
    sourcesTotal,
    docsPendingAnalysis,
    eventsTotal,
    lastRunAt: lastRun?.startedAt ?? null,
    lastRunStatus: lastRun?.status ?? null,
    lastRunErrors: lastRun?.errors ?? [],
    lastBriefDate,
    geminiConfigured,
  };

  const missingEnv = env.filter((e) => !e.set).map((e) => e.name);

  if (missingEnv.length > 0) {
    return {
      level: "error",
      headline: `Missing env var${missingEnv.length > 1 ? "s" : ""}: ${missingEnv.join(", ")}`,
      detail:
        "Node doesn't see these variables at all — check .env.local exists and has real values, " +
        "and that you restarted `npm run dev` after editing it (env vars only load at server start).",
      env,
      stats,
    };
  }

  if (projectIdMismatch) {
    return {
      level: "error",
      headline: "Firebase project ID mismatch",
      detail: `FIREBASE_ADMIN_PROJECT_ID (${adminProjectId}) doesn't match NEXT_PUBLIC_FIREBASE_PROJECT_ID (${clientProjectId}). They must point at the same Firebase project.`,
      env,
      stats,
    };
  }

  if (firestoreError) {
    return {
      level: "error",
      headline: "Firestore unreachable",
      detail: firestoreError,
      env,
      stats,
    };
  }

  if (sourcesTotal === 0) {
    return {
      level: "error",
      headline: "No sources seeded",
      detail: "Env vars and Firestore connection look fine. Click \"Run pipeline now\" (top right) to seed and run it directly — no terminal needed.",
      env,
      stats,
    };
  }

  if (!lastRun) {
    return {
      level: "warning",
      headline: "Pipeline hasn't run yet",
      detail: "Click \"Run pipeline now\" (top right) to trigger it directly, or wait for the 05:00 UTC scheduled run.",
      env,
      stats,
    };
  }

  if (lastRun.status === "failed") {
    return {
      level: "error",
      headline: "Last run failed",
      detail: lastRun.errors.length > 0 ? lastRun.errors.join(" · ") : "See Vercel function logs for /api/cron/daily.",
      env,
      stats,
    };
  }

  if (lastRun.status === "partial") {
    return {
      level: "warning",
      headline: "Last run had failures",
      detail: lastRun.errors.length > 0 ? lastRun.errors.join(" · ") : "One or more sources failed to collect.",
      env,
      stats,
    };
  }

  const hoursSinceLastRun = (Date.now() - new Date(lastRun.startedAt).getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastRun > 30) {
    return {
      level: "warning",
      headline: "No run in the last 30h",
      detail: "Expected a daily run — check the Vercel Cron dashboard for /api/cron/daily.",
      env,
      stats,
    };
  }

  return {
    level: "ok",
    headline: "Pipeline healthy",
    detail: `Last ran ${new Date(lastRun.startedAt).toLocaleString()} · ${eventsTotal} events collected so far.`,
    env,
    stats,
  };
}
