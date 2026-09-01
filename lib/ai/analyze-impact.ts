import { callClaudeJson } from "./gemini";
import type { Event, RelevanceLevel, TimeHorizon } from "@/types";

const PROMPT_VERSION = "impact-v1";

export interface ImpactAnalysisResult {
  impact: {
    directKenyaImpact: RelevanceLevel;
    indirectKenyaImpact: RelevanceLevel;
    regionalImpact: RelevanceLevel;
    globalImpact: RelevanceLevel;
    futureRelevance: RelevanceLevel;
    strategicRelevance: RelevanceLevel;
    timeHorizon: TimeHorizon;
  };
  scores: {
    importance: number;
    kenyaRelevance: number;
    futureSignal: number;
    riskScore: number;
    opportunityScore: number;
    confidence: number;
  };
  businessImplication: string; // §27 — plain business-language translation
  potentialRisks: string[];
  potentialOpportunities: string[];
}

const SYSTEM_PROMPT = `You are the impact, risk and opportunity analysis engine for Business Trend
Watch. You receive a structured event and must reason like a business
intelligence analyst, not a news summarizer.

Apply this fundamental rule to every event (this is the system's core
principle — do not skip it):
- Does this affect Kenya now?
- Could it affect Kenya later?
- Does it reveal a regional or global trend?
- Does it reveal where trade, investment, markets, technology, supply
  chains or policy could be heading?
- Could this represent an opportunity or risk that is not yet obvious?

An event can be LOW impact today but HIGH future relevance — never discard
a low-current-impact event just because Kenya's direct exposure today is
small; if it signals a future trend, say so explicitly via futureRelevance
and strategicRelevance.

Weight strategicRelevance upward for events touching global trade
chokepoints (Suez Canal, Red Sea, Bab el-Mandeb, Strait of Hormuz, Panama
Canal), East/Southern African trade corridors (Northern Corridor, LAPSSET,
Central Corridor, Ethiopia-Djibouti, Nacala, Beira, Lobito, Walvis Bay), or
commodities Kenya/East Africa is exposed to as an importer or exporter
(crude oil, fertilizer, wheat, maize, edible oils as imports; tea, coffee,
horticulture as exports) — disruption at these points tends to have
outsized downstream effects even when the originating event looks distant
or minor.

Score fields 0-100, based on the evidence actually present in the event —
do not inflate scores for dramatic effect. Be conservative and explain your
reasoning is embedded in the businessImplication field, in plain business
language (avoid "sources say" hedging).

Respond with ONLY a single JSON object, no markdown fences, no preamble,
matching this TypeScript shape:

{
  "impact": {
    "directKenyaImpact": "low" | "medium" | "high" | "critical",
    "indirectKenyaImpact": "low" | "medium" | "high" | "critical",
    "regionalImpact": "low" | "medium" | "high" | "critical",
    "globalImpact": "low" | "medium" | "high" | "critical",
    "futureRelevance": "low" | "medium" | "high" | "critical",
    "strategicRelevance": "low" | "medium" | "high" | "critical",
    "timeHorizon": "immediate" | "short_term" | "medium_term" | "long_term" | "structural"
  },
  "scores": {
    "importance": number,
    "kenyaRelevance": number,
    "futureSignal": number,
    "riskScore": number,
    "opportunityScore": number,
    "confidence": number
  },
  "businessImplication": string,
  "potentialRisks": string[],
  "potentialOpportunities": string[]
}`;

export async function analyzeEventImpact(
  event: Pick<
    Event,
    | "title"
    | "summary"
    | "what"
    | "who"
    | "where"
    | "when"
    | "whyItMatters"
    | "affectedSectors"
    | "affectedMarkets"
    | "domains"
    | "country"
    | "region"
  >
): Promise<ImpactAnalysisResult> {
  return callClaudeJson<ImpactAnalysisResult>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: JSON.stringify(event, null, 2),
      },
    ],
    // 4096, not 1500 — this exact call was the one truncating mid-JSON in
    // production (businessImplication cut off mid-word). See
    // lib/ai/gemini.ts for why: maxOutputTokens covers hidden "thinking"
    // tokens too, not just the visible response.
    maxTokens: 4096,
  });
}

export const IMPACT_PROMPT_VERSION = PROMPT_VERSION;
