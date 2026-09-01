// Single source of truth for Firestore collection names (§46).
// Never hardcode a collection string elsewhere — import from here.
export const COLLECTIONS = {
  USERS: "users",
  SOURCES: "sources",
  SOURCE_RUNS: "source_runs",
  PIPELINE_RUNS: "pipeline_runs",
  RAW_DOCUMENTS: "raw_documents",
  EVENTS: "events",
  ENTITIES: "entities",
  SECTORS: "sectors",
  RELATIONSHIPS: "relationships",
  AI_ANALYSIS: "ai_analysis",
  TRENDS: "trends",
  TREND_EVIDENCE: "trend_evidence",
  RISKS: "risks",
  OPPORTUNITIES: "opportunities",
  ALERTS: "alerts",
  DAILY_BRIEFS: "daily_briefs",
  WEEKLY_BRIEFS: "weekly_briefs",
  WATCHLISTS: "watchlists",
  SYSTEM_SETTINGS: "system_settings",
} as const;
