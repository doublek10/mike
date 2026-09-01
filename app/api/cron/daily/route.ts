// Combined daily cron — runs collect -> analyze -> briefings in one pass.
//
// WHY THIS EXISTS: Vercel's Hobby (free) plan only allows cron schedules
// that fire at most once per day, and caps each function invocation at 60
// seconds. This route exists purely to fit the pipeline inside that box —
// it does NOT replace /api/cron/collect, /api/cron/analyze, or
// /api/cron/briefings, which are left untouched below. When you move to
// Vercel Pro (which allows per-minute schedules and longer durations), just
// add their schedules back to vercel.json — e.g.:
//
//   { "path": "/api/cron/collect",   "schedule": "*/30 * * * *" },
//   { "path": "/api/cron/analyze",   "schedule": "*/15 * * * *" },
//   { "path": "/api/cron/briefings", "schedule": "0 5 * * *"    }
//
// and either remove this route's entry from vercel.json or leave it as a
// once-daily catch-all — no code changes required either way, since all
// three steps just call the same pipeline.ts functions these routes do.
//
// BATCH SIZE: the analyze step makes 2 AI calls per document, plus 1 more
// for the daily brief. Gemini's free tier for gemini-3.6-flash is rate-
// limited to 5 requests/minute per project (confirmed from a live 429
// response, not a guess — see lib/ai/gemini.ts for the source). This
// route has a 60s budget shared across collect + analyze + brief
// generation, and lib/ai/gemini.ts already paces calls ~13s apart to stay
// under that limit — so a batch of more than 1-2 documents risks running
// past the 60s ceiling before it finishes. DAILY_ANALYZE_BATCH_SIZE
// defaults to 1 for that reason. Any raw_documents left over simply stay
// `processed: false` and are picked up automatically on tomorrow's run —
// nothing is lost, it just trickles in a document or two per day. Raise
// this only if you've upgraded past the Hobby plan's 60s function limit
// (Vercel Pro allows much longer), since a higher batch size doesn't help
// while that ceiling is still in place.

import { NextRequest, NextResponse } from "next/server";
import { runDailyPipeline } from "@/lib/intelligence/pipeline";

export const dynamic = "force-dynamic";

export const maxDuration = 60; // Hobby plan ceiling — keep batch sizes tuned to this

const DAILY_ANALYZE_BATCH_SIZE = Number(process.env.DAILY_ANALYZE_BATCH_SIZE || 1);

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && !isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailyPipeline(DAILY_ANALYZE_BATCH_SIZE);
  return NextResponse.json(result);
}
