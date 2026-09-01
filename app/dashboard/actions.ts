"use server";

// Server Action backing the "Run pipeline now" button in the dashboard
// header. Calls the exact same runDailyPipeline() that /api/cron/daily
// uses — but in-process, with no HTTP round-trip and no CRON_SECRET check,
// since it's invoked directly from the dashboard itself rather than an
// external scheduler. This is the fastest way to see whether the pipeline
// actually works: no curl, no deployed URL to guess, no auth header.
import { runDailyPipeline, type DailyPipelineResult } from "@/lib/intelligence/pipeline";

const DAILY_ANALYZE_BATCH_SIZE = Number(process.env.DAILY_ANALYZE_BATCH_SIZE || 1);

export async function runPipelineNowAction(): Promise<DailyPipelineResult> {
  return runDailyPipeline(DAILY_ANALYZE_BATCH_SIZE);
}
