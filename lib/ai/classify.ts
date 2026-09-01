import { callClaudeJson } from "./gemini";
import type { Domain, Event, RawDocument, SourceTierType } from "@/types";

const PROMPT_VERSION = "classify-v1";

export interface ClassificationResult {
  relevantToSystem: boolean; // AI can reject pure noise (spam, irrelevant listicles, etc.)
  title: string;
  summary: string;
  eventType: Event["eventType"];
  what: string;
  who: string[];
  where: string;
  when: string;
  whyItMatters: string;
  affectedSectors: string[];
  affectedMarkets: string[];
  relatedPolicies: string[];
  relatedCommodities: string[];
  relatedTradeRoutes: string[];
  domains: Domain[];
  country: string;
  region: string;
  entities: { type: string; name: string }[];
  sourceTierGuess: SourceTierType;
}

const SYSTEM_PROMPT = `You are the classification and extraction engine for Business Trend Watch,
a business/trade intelligence system covering Kenya, East Africa (EAC), Africa
(AfCFTA/SADC/TFTA/COMESA/IGAD), and global trade & economic developments.

Your job for each raw document is to:
1. Decide if it is genuinely relevant to business/trade/economic intelligence
   (reject pure entertainment, sports, celebrity news, spam).
2. Extract a structured event: what happened, who is involved, where, when,
   why it matters, which sectors/markets/policies/commodities/trade routes
   are implicated, which domains apply, and a best-guess source tier
   (primary = official government/org source, secondary = reputable
   reporting, tertiary = commentary/opinion).

When extracting relatedCommodities, relatedTradeRoutes, affectedSectors, and
entities, actively watch for (not an exhaustive list — extract whatever is
actually mentioned, but these are worth specifically checking for since a
single article often mentions them only in passing):
- Commodities: crude oil, natural gas/LNG, coal, gold, copper, cobalt,
  lithium, nickel, iron ore, aluminium, steel, fertilizer, wheat, maize,
  rice, sugar, coffee, tea, cocoa, cotton, livestock, edible oils
- East/Southern African trade corridors: Northern Corridor, LAPSSET,
  Central Corridor, Ethiopia-Djibouti, Nacala, Beira, Maputo, Lobito,
  Walvis Bay
- Global trade chokepoints: Suez Canal, Red Sea, Bab el-Mandeb, Gulf of
  Aden, Strait of Hormuz, Panama Canal, Cape of Good Hope
- Major African ports: Mombasa, Lamu, Dar es Salaam, Djibouti, Durban,
  Tanger Med, Port Said
- Regional blocs beyond EAC: COMESA, SADC, TFTA, AfCFTA, IGAD
- Cross-cutting economic signals: tariffs, non-tariff barriers, currency
  movements, FDI flows, industrialisation policy, labour costs/strikes,
  protectionism, trade wars, sanctions, supply chain disruption,
  digital trade

Respond with ONLY a single JSON object matching this TypeScript shape, and
nothing else (no markdown fences, no preamble):

{
  "relevantToSystem": boolean,
  "title": string,
  "summary": string, // 2-3 plain-language sentences
  "eventType": "policy" | "economic_data" | "trade" | "labour" | "investment" | "infrastructure" | "market_movement" | "geopolitical" | "regulatory" | "other",
  "what": string,
  "who": string[],
  "where": string,
  "when": string,
  "whyItMatters": string,
  "affectedSectors": string[],
  "affectedMarkets": string[],
  "relatedPolicies": string[],
  "relatedCommodities": string[],
  "relatedTradeRoutes": string[],
  "domains": Array<
    // Core geography/pillar domains (assign at least one of these):
    "kenya" | "labour" | "east_africa" | "africa" | "global" | "trade_logistics" | "sector" | "infrastructure_investment" |
    // Thematic tags (assign any that apply, in addition to a core domain):
    "agriculture" | "aviation" | "banking" | "business" | "climate" | "commodity" | "customs" |
    "development" | "digital_trade" | "economic_data" | "energy" | "environment" | "export" |
    "finance" | "food_security" | "geopolitics" | "government_policy" | "healthcare" | "insurance" |
    "investment" | "manufacturing" | "monetary_policy" | "procurement" | "regulation" | "security" |
    "shipping" | "taxation" | "technology" | "telecommunications" | "tourism"
  >,
  "country": string,
  "region": string,
  "entities": Array<{ "type": string, "name": string }>,
  "sourceTierGuess": "primary" | "secondary" | "tertiary"
}

If the document is not relevant, still return valid JSON with
"relevantToSystem": false and reasonable-effort values for the rest.`;

export async function classifyRawDocument(
  doc: Pick<RawDocument, "title" | "rawContent" | "sourceUrl" | "country" | "region">
): Promise<ClassificationResult> {
  return callClaudeJson<ClassificationResult>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `SOURCE URL: ${doc.sourceUrl}\nCOUNTRY: ${doc.country ?? "unknown"}\nREGION: ${doc.region ?? "unknown"}\nTITLE: ${doc.title}\n\nCONTENT:\n${doc.rawContent.slice(0, 6000)}`,
      },
    ],
    // 4096, not 1500 — maxOutputTokens is a combined budget covering
    // Gemini's hidden "thinking" tokens too (see lib/ai/gemini.ts), so a
    // tight budget was truncating the JSON output mid-string. This costs
    // nothing extra against the free-tier request quota (still 1 call),
    // only allows a longer response.
    maxTokens: 4096,
  });
}

export const CLASSIFY_PROMPT_VERSION = PROMPT_VERSION;
