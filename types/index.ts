// ============================================================================
// BUSINESS TREND WATCH — CORE TYPES
// Mirrors the Firestore collections defined in the system blueprint (§46-48).
// Keep this file as the single source of truth for shapes used across
// collectors, AI engine, API routes, and the dashboard.
// ============================================================================

// Core geography/pillar domains — these drive the main dashboard sections
// (Domain 1-8 in the sidebar/eyebrows: Kenya, Labour, East Africa, Africa,
// Global, Trade & Logistics, Sector, Infrastructure & Investment).
export type CoreDomain =
  | "kenya"
  | "labour"
  | "east_africa"
  | "africa"
  | "global"
  | "trade_logistics"
  | "sector"
  | "infrastructure_investment";

// Thematic tags used alongside a CoreDomain to describe *what kind* of
// development a source/event covers (policy area, sub-sector, economic
// signal type, etc). Sourced from the actual tagging used across the
// source registry in config/sources.ts — extend this list rather than
// inventing a new ad-hoc string when adding a source.
export type ThematicDomain =
  | "agriculture"
  | "aviation"
  | "banking"
  | "business"
  | "climate"
  | "commodity"
  | "customs"
  | "development"
  | "digital_trade"
  | "economic_data"
  | "energy"
  | "environment"
  | "export"
  | "finance"
  | "food_security"
  | "geopolitics"
  | "government_policy"
  | "healthcare"
  | "insurance"
  | "investment"
  | "manufacturing"
  | "monetary_policy"
  | "procurement"
  | "regulation"
  | "security"
  | "shipping"
  | "taxation"
  | "technology"
  | "telecommunications"
  | "tourism";

export type Domain = CoreDomain | ThematicDomain;

export type CollectionMethod =
  | "rss"
  | "api"
  | "open_data"
  | "csv"
  | "web_scrape"
  | "pdf"
  | "email_alert"
  | "manual";

export type Tier = 1 | 2 | 3;

export interface Source {
  id: string;
  name: string;
  organization: string;
  country: string;
  region: string;
  domains: Domain[];
  category: string;
  website: string;
  apiEndpoint?: string;
  rssEndpoint?: string;
  // CSS selector (Cheerio/jQuery-style) identifying the anchor tags for
  // each news item on the page, used by lib/collectors/web-scrape.ts when
  // collectionMethod is "web_scrape" — e.g. "article h2 a" or
  // ".press-release-list a.title". Optional: without one, the scraper
  // falls back to a generic heuristic (headline-like elements containing
  // a link) that works reasonably on simple pages but isn't reliable
  // across arbitrary site layouts — set this once you've checked the
  // source's actual page structure for anything you depend on.
  scrapeSelector?: string;
  collectionMethod: CollectionMethod;
  updateFrequencyMinutes: number;
  tier: Tier;
  reliabilityRating: number; // 0-100, editorial judgement, adjustable
  authorityRating: number; // 0-100 (official/primary vs commentary)
  machineReadable: boolean;
  active: boolean;
  lastSuccessfulCollection?: string; // ISO timestamp
  lastFailure?: string;
  lastFailureReason?: string;
  createdAt: string;
}

export interface SourceRun {
  id: string;
  sourceId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "partial" | "failed" | "skipped";
  itemsFound: number;
  itemsNew: number;
  error?: string;
}

// One doc per /api/cron/daily execution (whether from the schedule or the
// dashboard's "Run pipeline now" button) — the dashboard status badge
// reads THIS, not individual SourceRun docs, so one unimplemented or
// flaky source doesn't make the whole pipeline look broken. Individual
// SourceRun docs are still written and still useful for per-source
// debugging; this is the aggregate view.
export interface PipelineRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "partial" | "failed";
  seed: { seeded: boolean; created: number; updated: number } | { error: string };
  sourcesRun: number;
  sourcesFailed: number;
  sourcesSkipped: number;
  docsAnalyzed: number;
  eventsCreated: number;
  briefingGenerated: boolean;
  errors: string[]; // any step-level error messages, for a quick read without opening ai_analysis/source_runs
}

// ----------------------------------------------------------------------------
// Raw information layer (§15) — never analyze before this is saved.
// ----------------------------------------------------------------------------
export interface RawDocument {
  id: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  publishedAt?: string;
  collectedAt: string;
  rawContent: string;
  contentHash: string;
  country?: string;
  region?: string;
  language?: string;
  processed: boolean;
}

// ----------------------------------------------------------------------------
// Verification tier (§17)
// ----------------------------------------------------------------------------
export type SourceTierType = "primary" | "secondary" | "tertiary";

// ----------------------------------------------------------------------------
// Event — the structured, deduplicated unit of intelligence (§16, §19)
// ----------------------------------------------------------------------------
export type TimeHorizon =
  | "immediate"
  | "short_term"
  | "medium_term"
  | "long_term"
  | "structural";

export type RelevanceLevel = "low" | "medium" | "high" | "critical";

export interface EventEntity {
  type:
    | "country"
    | "organization"
    | "government_agency"
    | "company"
    | "union"
    | "sector"
    | "commodity"
    | "port"
    | "trade_corridor"
    | "policy"
    | "agreement"
    | "market"
    | "product";
  name: string;
}

export interface Event {
  id: string;
  rawDocumentIds: string[]; // all raw docs deduplicated into this event
  // Denormalized from the raw documents at creation time (see
  // buildEventFromDocuments in lib/intelligence/pipeline.ts) specifically
  // so the dashboard can link out to the original article(s) without an
  // extra Firestore read per event just to resolve rawDocumentIds.
  sources: { sourceName: string; url: string }[];
  title: string;
  summary: string; // AI-generated, plain-language
  eventType:
    | "policy"
    | "economic_data"
    | "trade"
    | "labour"
    | "investment"
    | "infrastructure"
    | "market_movement"
    | "geopolitical"
    | "regulatory"
    | "other";

  // §19 structured extraction
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
  entities: EventEntity[];

  sourceTier: SourceTierType;
  verified: boolean;

  // §20-21 impact
  impact: {
    directKenyaImpact: RelevanceLevel;
    indirectKenyaImpact: RelevanceLevel;
    regionalImpact: RelevanceLevel;
    globalImpact: RelevanceLevel;
    futureRelevance: RelevanceLevel;
    strategicRelevance: RelevanceLevel;
    timeHorizon: TimeHorizon;
  };

  // §28 scoring
  scores: {
    importance: number; // 0-100
    kenyaRelevance: number;
    futureSignal: number;
    riskScore: number;
    opportunityScore: number;
    confidence: number;
  };

  // §27 — plain-language business read on the event, and the specific
  // risks/opportunities the AI flagged (not just a score — the "why").
  // Generated by lib/ai/analyze-impact.ts on every event; not just for
  // events that score high on risk or opportunity, so low-risk events can
  // still surface an opportunity and vice versa.
  businessImplication: string;
  potentialRisks: string[];
  potentialOpportunities: string[];

  publishedAt?: string;
  collectedAt: string;
  analyzedAt?: string;
}

// ----------------------------------------------------------------------------
// AI analysis record — kept separate from Event so re-analysis / model
// upgrades never mutate the audit trail (§49 data quality control).
// ----------------------------------------------------------------------------
export interface AiAnalysis {
  id: string;
  eventId: string;
  model: string;
  promptVersion: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  confidence: number;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// Trend (§24)
// ----------------------------------------------------------------------------
export interface Trend {
  id: string;
  title: string;
  description: string;
  domains: Domain[];
  sectors: string[];
  direction: "rising" | "falling" | "stable" | "volatile";
  eventIds: string[]; // supporting evidence
  firstDetected: string;
  lastUpdated: string;
  strength: number; // 0-100
  timeHorizon: TimeHorizon;
}

// ----------------------------------------------------------------------------
// Risk (§22)
// ----------------------------------------------------------------------------
export type RiskCategory =
  | "regulatory"
  | "political"
  | "labour"
  | "supply_chain"
  | "commodity"
  | "currency"
  | "trade"
  | "investment"
  | "infrastructure"
  | "geopolitical"
  | "market";

export interface Risk {
  id: string;
  title: string;
  category: RiskCategory;
  description: string;
  riskScore: number; // 0-100
  severity: RelevanceLevel;
  probability: number; // 0-100
  timeHorizon: TimeHorizon;
  affectedSectors: string[];
  evidenceEventIds: string[];
  trendDirection: "escalating" | "stable" | "de-escalating";
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// Opportunity (§23)
// ----------------------------------------------------------------------------
export interface Opportunity {
  id: string;
  title: string;
  market: string;
  sector: string;
  reason: string;
  opportunityScore: number; // 0-100
  evidenceEventIds: string[];
  timeHorizon: TimeHorizon;
  potentialBeneficiaries: string[];
  requiredConditions: string[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// Alerts (§29)
// ----------------------------------------------------------------------------
export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface Alert {
  id: string;
  title: string;
  severity: AlertSeverity;
  reason: string;
  relatedEventIds: string[];
  relatedRiskIds?: string[];
  relatedOpportunityIds?: string[];
  createdAt: string;
  acknowledged: boolean;
}

// ----------------------------------------------------------------------------
// Briefs (§30-31)
// ----------------------------------------------------------------------------
export interface DailyBrief {
  id: string; // e.g. 2026-08-29
  date: string;
  topDevelopments: { eventId: string; headline: string; whyItMatters: string }[];
  kenyaImplications: string;
  regionalImplications: string;
  globalImplications: string;
  emergingRisks: string[];
  emergingOpportunities: string[];
  whatToWatchNext: string[];
  generatedAt: string;
}

export interface WeeklyBrief {
  id: string; // e.g. 2026-W35
  weekOf: string;
  majorDevelopments: string[];
  majorTrends: string[];
  sectorMovements: string[];
  policyChanges: string[];
  tradeDevelopments: string[];
  labourDevelopments: string[];
  regionalDevelopments: string[];
  globalSignals: string[];
  risks: string[];
  opportunities: string[];
  emergingThemes: string[];
  nextWeekWatchlist: string[];
  generatedAt: string;
}

export interface Sector {
  id: string;
  name: string;
  currentTrend: string;
  direction: "growth" | "decline" | "stable";
  majorDrivers: string[];
  risks: string[];
  opportunities: string[];
  relevantEventIds: string[];
  relevantPolicies: string[];
  relevantGlobalSignals: string[];
  confidence: number;
  updatedAt: string;
}
