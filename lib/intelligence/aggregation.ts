// Promotes already-analyzed events into the four "engine" collections
// (sectors, risks, opportunities, trends) that the dashboard's
// Sector Intelligence / Risks / Opportunities / Trends pages read from.
//
// DELIBERATELY NO AI CALLS HERE. Given the account's Gemini free-tier
// quota is 20 requests/day total, this entire file works by grouping and
// aggregating fields that lib/ai/classify.ts and lib/ai/analyze-impact.ts
// already extracted per-event — sector tags, scores, and the AI-written
// businessImplication/potentialRisks/potentialOpportunities text. A
// "smarter" version of this would use an LLM to synthesize a fresh title
// and description per cluster; that's a reasonable upgrade once quota
// allows it, but isn't worth spending part of a 20/day budget on right
// now. Clustering here is rule-based (shared category + sector/domain),
// not semantic — good enough to be useful, not claiming to be more.
//
// Called from runDailyPipeline (see lib/intelligence/pipeline.ts) after
// the brief step, using events already fetched for that run's context —
// cheap: this is one Firestore read of recent events, then N cheap writes.

import { randomUUID } from "crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { Event, Opportunity, Risk, RiskCategory, Sector, Trend } from "@/types";

const KNOWN_SECTORS = [
  "Agriculture", "Manufacturing", "Construction", "Transport", "Logistics", "Retail",
  "Real estate", "Tourism", "Hospitality", "Energy", "Mining", "Technology",
  "Financial services", "Healthcare", "Education", "Telecommunications",
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Events' affectedSectors come from free-text AI classification, not a
// fixed enum, so this matches loosely (case-insensitive substring) against
// the known sector list rather than requiring an exact string match.
function matchKnownSector(rawSector: string): string | null {
  const norm = rawSector.trim().toLowerCase();
  return KNOWN_SECTORS.find((s) => s.toLowerCase() === norm || norm.includes(s.toLowerCase())) ?? null;
}

// Maps an event's eventType onto the closest RiskCategory. Not every
// RiskCategory has a clean source signal without AI (supply_chain,
// commodity, currency, political) — those are simply never assigned here
// rather than guessed.
function eventTypeToRiskCategory(eventType: Event["eventType"]): RiskCategory {
  switch (eventType) {
    case "policy":
    case "regulatory":
      return "regulatory";
    case "trade":
      return "trade";
    case "labour":
      return "labour";
    case "investment":
      return "investment";
    case "infrastructure":
      return "infrastructure";
    case "geopolitical":
      return "geopolitical";
    case "economic_data":
    case "market_movement":
    case "other":
    default:
      return "market";
  }
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function stdev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = avg(nums);
  return Math.sqrt(avg(nums.map((n) => (n - m) ** 2)));
}

// Recent half vs older half of a time-sorted cluster, used by both trend
// direction and risk trendDirection. Needs at least 2 events to say
// anything about trajectory at all.
function splitRecentOlder<T>(sorted: T[]): { recent: T[]; older: T[] } {
  const mid = Math.ceil(sorted.length / 2);
  return { recent: sorted.slice(0, mid), older: sorted.slice(mid) };
}

export interface AggregationResult {
  sectorsUpdated: number;
  risksUpdated: number;
  opportunitiesUpdated: number;
  trendsUpdated: number;
}

export async function runAggregation(): Promise<AggregationResult> {
  // Recent window, not the whole history — a sector/risk/opportunity
  // profile should reflect current signal, not get diluted by everything
  // ever collected. 200 is generous headroom for where this project's
  // event volume realistically sits for a while.
  const snapshot = await getAdminDb()
    .collection(COLLECTIONS.EVENTS)
    .orderBy("analyzedAt", "desc")
    .limit(200)
    .get();
  const events = snapshot.docs.map((d) => d.data() as Event);

  const [sectorsUpdated, risksUpdated, opportunitiesUpdated, trendsUpdated] = await Promise.all([
    runSectorAggregation(events),
    runRiskAggregation(events),
    runOpportunityAggregation(events),
    runTrendAggregation(events),
  ]);

  return { sectorsUpdated, risksUpdated, opportunitiesUpdated, trendsUpdated };
}

// ============================================================================
// Sectors — one profile per known sector with at least one event. Simple
// group-by, no minimum-event threshold (even a single relevant event is
// worth surfacing on a sector's own page).
// ============================================================================
async function runSectorAggregation(events: Event[]): Promise<number> {
  const bySector = new Map<string, Event[]>();

  for (const event of events) {
    const matched = new Set(event.affectedSectors.map(matchKnownSector).filter((s): s is string => s !== null));
    for (const sector of matched) {
      if (!bySector.has(sector)) bySector.set(sector, []);
      bySector.get(sector)!.push(event);
    }
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const [sectorName, sectorEvents] of bySector) {
    const avgOpportunity = avg(sectorEvents.map((e) => e.scores.opportunityScore));
    const avgRisk = avg(sectorEvents.map((e) => e.scores.riskScore));

    let direction: Sector["direction"] = "stable";
    if (avgOpportunity - avgRisk > 15) direction = "growth";
    else if (avgRisk - avgOpportunity > 15) direction = "decline";

    const topEvents = [...sectorEvents].sort((a, b) => b.scores.importance - a.scores.importance).slice(0, 3);
    const risks = dedupeStrings(sectorEvents.flatMap((e) => e.potentialRisks ?? []).slice(0, 5));
    const opportunities = dedupeStrings(sectorEvents.flatMap((e) => e.potentialOpportunities ?? []).slice(0, 5));
    const policies = dedupeStrings(sectorEvents.flatMap((e) => e.relatedPolicies ?? []).slice(0, 5));

    const sector: Sector = {
      id: slugify(sectorName),
      name: sectorName,
      currentTrend:
        direction === "growth"
          ? `Opportunity signals outweighing risk across ${sectorEvents.length} recent event(s).`
          : direction === "decline"
            ? `Risk signals outweighing opportunity across ${sectorEvents.length} recent event(s).`
            : `Mixed signal across ${sectorEvents.length} recent event(s) — no clear direction yet.`,
      direction,
      majorDrivers: topEvents.map((e) => e.title),
      risks,
      opportunities,
      relevantEventIds: sectorEvents.map((e) => e.id),
      relevantPolicies: policies,
      relevantGlobalSignals: [],
      // More evidence = more confidence, capped — 5+ events reaches the cap
      // rather than requiring an arbitrarily large sample.
      confidence: Math.min(100, sectorEvents.length * 20),
      updatedAt: now,
    };

    await getAdminDb().collection(COLLECTIONS.SECTORS).doc(sector.id).set(sector);
    updated++;
  }

  return updated;
}

// ============================================================================
// Risks — clusters events with riskScore >= threshold, grouped by
// (category, primary sector). Title/description reuse the AI's own text
// from the cluster's highest-scoring event rather than synthesizing new
// copy (no AI calls in this file — see file header).
// ============================================================================
const RISK_THRESHOLD = 55;

async function runRiskAggregation(events: Event[]): Promise<number> {
  const eligible = events.filter((e) => e.scores.riskScore >= RISK_THRESHOLD);
  const clusters = new Map<string, Event[]>();

  for (const event of eligible) {
    const category = eventTypeToRiskCategory(event.eventType);
    const primarySector = event.affectedSectors[0] ?? event.domains[0] ?? "general";
    const key = `${category}:${slugify(primarySector)}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(event);
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const [key, clusterEvents] of clusters) {
    const [categoryStr, sectorSlug] = key.split(":");
    const category = categoryStr as RiskCategory;
    const sorted = [...clusterEvents].sort(
      (a, b) => new Date(b.analyzedAt ?? 0).getTime() - new Date(a.analyzedAt ?? 0).getTime()
    );
    const top = sorted[0];
    const riskScore = Math.max(...clusterEvents.map((e) => e.scores.riskScore));

    let severity: Risk["severity"] = "medium";
    if (riskScore >= 85) severity = "critical";
    else if (riskScore >= 70) severity = "high";
    else if (riskScore < 40) severity = "low";

    let trendDirection: Risk["trendDirection"] = "stable";
    if (sorted.length >= 2) {
      const { recent, older } = splitRecentOlder(sorted);
      const diff = avg(recent.map((e) => e.scores.riskScore)) - avg(older.map((e) => e.scores.riskScore));
      if (diff > 10) trendDirection = "escalating";
      else if (diff < -10) trendDirection = "de-escalating";
    }

    const docId = `risk-${key}`;
    const existingCreatedAt = await getExistingCreatedAt(COLLECTIONS.RISKS, docId);

    const risk: Risk = {
      id: docId,
      title: top.potentialRisks?.[0] ? truncateTitle(top.potentialRisks[0]) : top.title,
      category,
      description: top.businessImplication || top.summary,
      riskScore,
      severity,
      probability: Math.round(avg(clusterEvents.map((e) => e.scores.confidence))),
      timeHorizon: top.impact.timeHorizon,
      affectedSectors: dedupeStrings(clusterEvents.flatMap((e) => e.affectedSectors)),
      evidenceEventIds: clusterEvents.map((e) => e.id),
      trendDirection,
      createdAt: existingCreatedAt ?? now,
      updatedAt: now,
    };

    await getAdminDb().collection(COLLECTIONS.RISKS).doc(risk.id).set(risk);
    updated++;
    void sectorSlug; // part of the cluster key for uniqueness; not otherwise needed here
  }

  return updated;
}

// ============================================================================
// Opportunities — mirrors the risk clustering above using
// opportunityScore. `requiredConditions` is intentionally left empty: it's
// not something any current field can honestly answer without an AI call
// to reason about it, so this doesn't fabricate content for it.
// ============================================================================
const OPPORTUNITY_THRESHOLD = 55;

async function runOpportunityAggregation(events: Event[]): Promise<number> {
  const eligible = events.filter((e) => e.scores.opportunityScore >= OPPORTUNITY_THRESHOLD);
  const clusters = new Map<string, Event[]>();

  for (const event of eligible) {
    const sector = event.affectedSectors[0] ?? event.domains[0] ?? "general";
    const market = event.affectedMarkets[0] ?? event.region ?? event.country ?? "Regional";
    const key = `${slugify(sector)}:${slugify(market)}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(event);
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const [key, clusterEvents] of clusters) {
    const sorted = [...clusterEvents].sort((a, b) => b.scores.opportunityScore - a.scores.opportunityScore);
    const top = sorted[0];
    const opportunityScore = Math.max(...clusterEvents.map((e) => e.scores.opportunityScore));

    const oppId = `opp-${key}`;
    const existingCreatedAt = await getExistingCreatedAt(COLLECTIONS.OPPORTUNITIES, oppId);

    const opportunity: Opportunity = {
      id: oppId,
      title: top.potentialOpportunities?.[0] ? truncateTitle(top.potentialOpportunities[0]) : top.title,
      market: top.affectedMarkets[0] ?? top.region ?? top.country ?? "Regional",
      sector: top.affectedSectors[0] ?? top.domains[0] ?? "general",
      reason: top.businessImplication || top.summary,
      opportunityScore,
      evidenceEventIds: clusterEvents.map((e) => e.id),
      timeHorizon: top.impact.timeHorizon,
      potentialBeneficiaries: dedupeStrings(clusterEvents.flatMap((e) => e.who)).slice(0, 5),
      requiredConditions: [],
      confidence: Math.round(avg(clusterEvents.map((e) => e.scores.confidence))),
      createdAt: existingCreatedAt ?? now,
      updatedAt: now,
    };

    await getAdminDb().collection(COLLECTIONS.OPPORTUNITIES).doc(opportunity.id).set(opportunity);
    updated++;
  }

  return updated;
}

// ============================================================================
// Trends — requires >=2 events sharing (domain, sector) to qualify at all;
// a single event is an event, not a trend. Direction blends trajectory
// (is the net opportunity-minus-risk signal rising or falling between the
// cluster's older and newer half) with volatility (high variance across
// individual events' net signal beats out a mild rising/falling read).
// ============================================================================
async function runTrendAggregation(events: Event[]): Promise<number> {
  const clusters = new Map<string, Event[]>();

  for (const event of events) {
    const domain = event.domains[0];
    const sector = event.affectedSectors[0];
    if (!domain || !sector) continue;
    const key = `${domain}:${slugify(sector)}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(event);
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (const [key, clusterEvents] of clusters) {
    if (clusterEvents.length < 2) continue; // not a trend yet — just one article

    const sorted = [...clusterEvents].sort(
      (a, b) => new Date(b.analyzedAt ?? 0).getTime() - new Date(a.analyzedAt ?? 0).getTime()
    );
    const netSignals = sorted.map((e) => e.scores.opportunityScore - e.scores.riskScore);
    const volatility = stdev(netSignals);

    let direction: Trend["direction"] = "stable";
    if (volatility > 35) {
      direction = "volatile";
    } else {
      const { recent, older } = splitRecentOlder(sorted);
      const diff = avg(recent.map((e) => e.scores.opportunityScore - e.scores.riskScore)) -
        avg(older.map((e) => e.scores.opportunityScore - e.scores.riskScore));
      if (diff > 10) direction = "rising";
      else if (diff < -10) direction = "falling";
    }

    const [domain, sectorSlug] = key.split(":");
    const top = sorted[0];
    const sectorName = top.affectedSectors[0] ?? sectorSlug;

    const trend: Trend = {
      id: `trend-${key}`,
      title: `${sectorName} — ${top.title}`,
      description: top.businessImplication || top.summary,
      domains: dedupeStrings(clusterEvents.flatMap((e) => e.domains)) as Trend["domains"],
      sectors: dedupeStrings(clusterEvents.flatMap((e) => e.affectedSectors)),
      direction,
      eventIds: clusterEvents.map((e) => e.id),
      firstDetected: sorted[sorted.length - 1].analyzedAt ?? now,
      lastUpdated: now,
      // Evidence volume + average importance, capped at 100 — a heuristic,
      // not a statistically rigorous strength score.
      strength: Math.min(100, clusterEvents.length * 15 + avg(clusterEvents.map((e) => e.scores.importance)) / 2),
      timeHorizon: top.impact.timeHorizon,
    };

    await getAdminDb().collection(COLLECTIONS.TRENDS).doc(trend.id).set(trend, { merge: true });
    updated++;
    void domain;
  }

  return updated;
}

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function truncateTitle(text: string, maxLen = 80): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 1).trimEnd() + "…";
}

// Risk/Opportunity docs are fully overwritten (not merged) on every run so
// stale fields from a cluster that's shrunk don't linger — but createdAt
// should still reflect when the cluster was FIRST seen, not the latest
// run. One cheap read per cluster to check.
async function getExistingCreatedAt(collection: string, docId: string): Promise<string | null> {
  const snap = await getAdminDb().collection(collection).doc(docId).get();
  const data = snap.data();
  return (data?.createdAt as string | undefined) ?? null;
}
