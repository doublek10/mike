"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runPipelineNowAction } from "@/app/dashboard/actions";
import type { DailyPipelineResult } from "@/lib/intelligence/pipeline";

function hasError(x: unknown): x is { error: string } {
  return typeof x === "object" && x !== null && "error" in x;
}

// Mirrors the actual step order in lib/intelligence/pipeline.ts
// (runDailyPipeline). Purely a client-side progress indicator — the real
// pipeline runs as one server action call with no streaming, so this
// advances on a timer rather than genuine per-step signals. It halts on
// the final stage and waits there for as long as the request actually
// takes, so it never claims to be further along than it can know.
const PIPELINE_STAGES = [
  { label: "Seeding source registry" },
  { label: "Collecting from live sources" },
  { label: "Classifying & analyzing with AI" },
  { label: "Drafting today's brief" },
  { label: "Aggregating sectors, risks & trends" },
] as const;

const STAGE_ADVANCE_MS = 2600;

function PipelineLoading() {
  const [stageIndex, setStageIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    const stageTimer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, PIPELINE_STAGES.length - 1));
    }, STAGE_ADVANCE_MS);
    const clock = setInterval(() => setElapsedMs(Date.now() - startRef.current), 200);
    return () => {
      clearInterval(stageTimer);
      clearInterval(clock);
    };
  }, []);

  const elapsedLabel = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="relative mt-3 overflow-hidden rounded-md border border-base-700 bg-base-950/60">
      {/* Slow-rotating radar glow, purely decorative, echoes the "control
          room" theme used elsewhere (sidebar status dot, amber accents). */}
      <div className="pointer-events-none absolute -inset-10 opacity-30 animate-[spin_7s_linear_infinite]">
        <div className="h-full w-full bg-radar-sweep" />
      </div>

      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-signal-amber">AI pipeline running</span>
          <span className="text-[11px] font-mono text-ink-500 tabular-nums">{elapsedLabel}s</span>
        </div>

        <ul className="space-y-2">
          {PIPELINE_STAGES.map((stage, i) => {
            const isDone = i < stageIndex;
            const isActive = i === stageIndex;
            return (
              <li key={stage.label} className="flex items-center gap-2.5 text-xs font-mono">
                <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {isDone && (
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-signal-opportunity">
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  {isActive && !isDone && (
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-signal-amber border-t-transparent animate-spin" />
                  )}
                  {!isDone && !isActive && <span className="h-1.5 w-1.5 rounded-full bg-base-600" />}
                </span>
                <span
                  className={
                    isDone
                      ? "text-ink-500 line-through decoration-base-600"
                      : isActive
                      ? "text-ink-100"
                      : "text-ink-500"
                  }
                >
                  {stage.label}
                  {isActive && <span className="animate-pulse">…</span>}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="text-[11px] text-ink-500 pt-2 border-t border-base-700">
          Working through sources, then handing off to the AI classifier and impact analysis. Runs can take up
          to a minute depending on how many new items there are.
        </p>
      </div>
    </div>
  );
}

export function RunPipelineButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DailyPipelineResult | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleClick() {
    setResult(null);
    setOpen(true);
    startTransition(async () => {
      const r = await runPipelineNowAction();
      setResult(r);
      // Re-fetch the status badge + any dashboard data on this page now
      // that the pipeline has (hopefully) written something.
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="text-xs font-mono px-3 py-1.5 rounded-full border border-base-700 bg-base-900 text-ink-300 hover:text-ink-100 hover:border-ink-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Running pipeline…" : "Run pipeline now"}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[28rem] panel p-4 z-50 shadow-xl max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Pipeline run</p>
            <button onClick={() => setOpen(false)} className="text-ink-500 hover:text-ink-100 text-xs">
              close
            </button>
          </div>

          {isPending && !result && <PipelineLoading />}

          {result && (
            <div className="mt-3 space-y-3 text-xs">
              <Row label="Seed">
                {hasError(result.seed) ? (
                  <ErrorText text={result.seed.error} />
                ) : (
                  <span className="text-ink-100">
                    {result.seed.seeded ? `Seeded ${result.seed.created} sources` : "Already seeded"}
                  </span>
                )}
              </Row>

              <Row label="Collect">
                {hasError(result.collect) ? (
                  <ErrorText text={result.collect.error} />
                ) : (
                  <div className="space-y-1">
                    <span className="text-ink-100">{result.collect.sourcesRun} sources run</span>
                    {result.collect.summary
                      .filter((s) => s.status === "failed")
                      .map((s) => (
                        <p key={s.sourceId} className="text-signal-risk">
                          {s.sourceName}: {s.error}
                        </p>
                      ))}
                    {result.collect.summary
                      .filter((s) => s.status === "skipped")
                      .map((s) => (
                        <p key={s.sourceId} className="text-ink-500">
                          {s.sourceName}: not yet implemented
                        </p>
                      ))}
                  </div>
                )}
              </Row>

              <Row label="Analyze">
                {hasError(result.analyze) ? (
                  <ErrorText text={result.analyze.error} />
                ) : (
                  <span className="text-ink-100">
                    {result.analyze.processed} docs processed · {result.analyze.eventsCreated} events created
                    {result.analyze.rejected ? ` · ${result.analyze.rejected} rejected` : ""}
                  </span>
                )}
              </Row>

              <Row label="Brief">
                {hasError(result.briefing) ? (
                  <ErrorText text={result.briefing.error} />
                ) : result.briefing.generated ? (
                  <span className="text-signal-opportunity">Generated for {result.briefing.brief.date}</span>
                ) : (
                  <span className="text-ink-500">{result.briefing.message}</span>
                )}
              </Row>

              <Row label="Sectors / Risks / Opportunities / Trends">
                {hasError(result.aggregation) ? (
                  <ErrorText text={result.aggregation.error} />
                ) : (
                  <span className="text-ink-100">
                    {result.aggregation.sectorsUpdated} sectors · {result.aggregation.risksUpdated} risks ·{" "}
                    {result.aggregation.opportunitiesUpdated} opportunities · {result.aggregation.trendsUpdated}{" "}
                    trends
                  </span>
                )}
              </Row>

              <p className="text-[11px] text-ink-500 pt-2 border-t border-base-700">
                Ran at {new Date(result.ranAt).toLocaleString()}. If everything above shows 0 and no errors, check
                that your RSS sources in config/sources.ts actually have recent items — the pipeline can run
                successfully and still find nothing new to do.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      {children}
    </div>
  );
}

function ErrorText({ text }: { text: string }) {
  return <p className="text-signal-risk break-words">{text}</p>;
}
