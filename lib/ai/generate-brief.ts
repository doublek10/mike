import { callClaudeJson } from "./gemini";
import type { Event } from "@/types";

const SYSTEM_PROMPT = `You are the daily intelligence editor for Business Trend Watch. You receive
a batch of today's analyzed events (already scored for importance, Kenya
relevance, and risk/opportunity) and must produce the daily brief a busy
executive reads in under two minutes.

Pick the 5 most important developments by combining importance, kenyaRelevance
and futureSignal scores with your own editorial judgement — do not just sort
by one number. Write in plain business language, no hedging filler like
"reports suggest". Be specific about mechanisms (what changes, for whom, by
when), not vague ("this could impact many sectors").

Respond with ONLY a single JSON object, no markdown fences, no preamble:

{
  "topDevelopments": [ { "eventId": string, "headline": string, "whyItMatters": string } ],
  "kenyaImplications": string,
  "regionalImplications": string,
  "globalImplications": string,
  "emergingRisks": string[],
  "emergingOpportunities": string[],
  "whatToWatchNext": string[]
}`;

export interface DailyBriefAiOutput {
  topDevelopments: { eventId: string; headline: string; whyItMatters: string }[];
  kenyaImplications: string;
  regionalImplications: string;
  globalImplications: string;
  emergingRisks: string[];
  emergingOpportunities: string[];
  whatToWatchNext: string[];
}

export async function generateDailyBrief(events: Event[]): Promise<DailyBriefAiOutput> {
  const compact = events.map((e) => ({
    eventId: e.id,
    title: e.title,
    summary: e.summary,
    domains: e.domains,
    country: e.country,
    scores: e.scores,
    impact: e.impact,
  }));

  return callClaudeJson<DailyBriefAiOutput>({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(compact, null, 2) }],
    // 6144 — the brief aggregates multiple events into topDevelopments[],
    // emergingRisks[], emergingOpportunities[], etc., so it's the largest
    // of the three JSON responses and needs the most headroom. Same
    // truncation root cause as classify.ts/analyze-impact.ts — see
    // lib/ai/gemini.ts.
    maxTokens: 6144,
  });
}
