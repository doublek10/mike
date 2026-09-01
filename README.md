# Business Trend Watch

A Kenya / East Africa / Africa / global business & trade intelligence platform.
Built on Next.js + Firebase + Gemini (free-tier), deployed on Vercel with serverless
cron jobs — no permanently running server.

This repo implements the **MVP loop** end-to-end:

```
SOURCE → COLLECT → STORE (raw) → AI CLASSIFY → AI IMPACT ANALYSIS → STORE (event) → DASHBOARD
```

and gives every later phase (trend detection, dedicated risk/opportunity
engines, alerts, weekly reports, the conversational assistant) a schema and
folder to land in without a rebuild.

---

## 1. What's actually implemented vs. roadmap

**Working end-to-end right now:**
- Source registry (`config/sources.ts`) seeded with real Kenya / EAC / Africa / global sources
- RSS collector + deduplication (content hash + URL + title similarity)
- Two-stage Gemini pipeline: classification & structured event extraction, then impact/risk/opportunity scoring
- Firestore schema for every collection in the blueprint (§46)
- Vercel Cron: `/api/cron/daily` runs once/day (05:00 UTC) and chains collect → analyze → briefings, to stay within the Vercel Hobby plan's once-per-day cron limit and 60s function cap. The individual `collect`, `analyze`, and `briefings` routes still exist and work standalone — see "Cron on Hobby vs. Pro" below for how to split them back apart once you upgrade.
- Full dashboard: Main, Kenya, Regional, Global, Trade, Labour, Trends, Risks, Opportunities, Sectors, Daily Brief, Settings/Sources — all reading live Firestore data with proper empty states
- Read APIs for events, sources, briefings, analysis audit trail
- Sector / Risk / Opportunity / Trend aggregation (`lib/intelligence/aggregation.ts`) — promotes analyzed events into named, tracked records on every pipeline run. Deliberately rule-based, not AI-synthesized: given the Gemini free tier's 20-requests/day cap, this reuses text the AI already wrote per-event (`businessImplication`, `potentialRisks`, `potentialOpportunities`) rather than spending quota on a fresh summarization pass per cluster. Risks/Opportunities require a 55+ score to qualify; Trends require ≥2 events sharing a domain+sector (a single article isn't a trend).

**Deliberately stubbed, with an implementation plan written directly in the code comments:**
- `app/api/cron/alerts/route.ts` — the Alert Engine (§29). Comment lays out the threshold-based detection plan.
- Weekly report, relationship graph (§48), and the conversational AI assistant (§43) are not built — `lib/ai/generate-brief.ts` is the template to copy for the weekly version.

Nothing here is faked — every stub returns a clear `501` with a plan, and the dashboard renders honest empty states rather than placeholder data.

---

## 2. Setup

> **API key hygiene:** never paste your real `GEMINI_API_KEY`, Firebase
> Admin private key, or `CRON_SECRET` into a GitHub issue, a public gist, a
> forum post, an AI chat, or anywhere else outside `.env.local` /
> your Vercel project settings. Google (and GitHub) actively scan public
> repos and pastes for exposed keys and will auto-revoke them the moment
> they're detected — `.gitignore` already excludes `.env.local` and `.env`
> from git, but that only protects you if you never paste the raw value
> somewhere else by hand. If a key ever does leak: delete it immediately
> at https://aistudio.google.com/apikey (or the equivalent Firebase/Vercel
> console), generate a new one, update it in Vercel's environment
> variables, and redeploy — env var changes don't apply to an already-
> running deployment.

### Prerequisites
- Node.js 20.6+ (the seed script below relies on Node's built-in `--env-file` flag)
- A Firebase project (Firestore + Authentication enabled)
- A Gemini API key (free, from Google AI Studio — no credit card needed)

### Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Console → Project Settings → General → Your apps (Web app config) |
| `FIREBASE_ADMIN_*` | Firebase Console → Project Settings → Service Accounts → Generate new private key |
| `GEMINI_API_KEY` | aistudio.google.com/apikey (free tier) |
| `CRON_SECRET` | Any random string. Leave blank locally; set it in Vercel and Vercel Cron will send it automatically as a Bearer token. |

> `FIREBASE_ADMIN_PRIVATE_KEY` from the downloaded JSON has literal `\n` sequences — paste it as-is (single line, quotes included); the code un-escapes it at runtime.

### Sources — no manual seeding required

`/api/cron/daily` automatically seeds the `sources` collection from
`config/sources.ts` the first time it runs, if the collection is still
empty (see `lib/intelligence/seed.ts`). You don't need to run anything by
hand for a fresh deployment to start working — just trigger the pipeline
once (either wait for the 05:00 UTC cron, or hit `/api/cron/daily`
manually, see below) and it self-heals.

You only need the manual script if you've **edited or added sources** in
`config/sources.ts` after the collection already exists — auto-seed only
fires when the collection is empty, so it won't pick up later edits on its
own:

```bash
npm run seed:sources
```

> **Don't run `npx tsx scripts/seed-sources.ts` directly** — it'll fail
> with a missing-credentials error. `npm run seed:sources` passes
> `--env-file=.env.local` so the script can actually see your
> `FIREBASE_ADMIN_*` variables; Next.js loads `.env.local` for you
> automatically for `next dev`/`build`/`start`, but this seed script runs
> as a plain standalone Node process outside Next.js, so nothing loads
> `.env.local` for it unless you tell it to. If the seed silently does
> nothing, check your terminal output for `Seed failed: ...`.

### Run locally

```bash
npm run dev
```

Visit `http://localhost:3000` (redirects to `/dashboard`). To actually
populate data, trigger the pipeline once:

```bash
curl http://localhost:3000/api/cron/daily
```

(No `Authorization` header needed locally — `CRON_SECRET` is only enforced
when the env var is set, which you'd typically only do in Vercel.)

Trigger the pipeline manually while developing (equivalent to clicking
"Run pipeline now" on the dashboard, just from the terminal):

```bash
curl http://localhost:3000/api/cron/daily
```

The original per-stage routes (`collect`, `analyze`, `briefings`) still
work standalone too, if you want to test one stage in isolation:

```bash
curl http://localhost:3000/api/cron/collect
curl http://localhost:3000/api/cron/analyze
curl http://localhost:3000/api/cron/briefings
```

### Deploy to Vercel

```bash
vercel
```

Set the same environment variables in the Vercel project settings (Production
+ Preview). `vercel.json` already defines the cron schedule — Vercel picks
it up automatically on deploy.

> **Vercel Hobby plan note:** the free tier limits cron jobs to once per day
> and caps each function invocation at 60 seconds. `vercel.json` is set up
> for exactly that: a single `/api/cron/daily` schedule that chains
> collect → analyze → briefings in one run, with the analyze step capped
> to `DAILY_ANALYZE_BATCH_SIZE` (default 1) document so it fits the 60s
> budget alongside Gemini's free-tier rate limit — confirmed at 5
> requests/minute for `gemini-3.6-flash` from Google's own 429 response,
> not a guess (see `lib/ai/gemini.ts`, which paces calls ~13s apart to
> stay under it). Leftover documents are simply picked up on the next
> day's run — nothing is lost, it just trickles in a document or two per
> day until you're past Hobby's 60s limit.
>
> The original `collect`, `analyze`, and `briefings` routes are still in
> the codebase, unchanged and fully working standalone. When you move to
> Vercel Pro (per-minute cron, longer function timeouts), swap
> `vercel.json`'s `crons` array for:
> ```json
> [
>   { "path": "/api/cron/collect",   "schedule": "*/30 * * * *" },
>   { "path": "/api/cron/analyze",   "schedule": "*/15 * * * *" },
>   { "path": "/api/cron/briefings", "schedule": "0 5 * * *"    }
> ]
> ```
> No code changes needed — both paths call the same functions in
> `lib/intelligence/pipeline.ts`.

---

## 3. Architecture map

```
config/sources.ts        → source registry seed (§6-14, §45)
types/index.ts            → single source of truth for every schema (§46-48)
lib/firebase/             → client SDK (browser) + lazy admin SDK (server)
lib/collectors/           → collection mechanisms (rss.ts implemented; add
                             api.ts / web-scrape.ts / pdf.ts / csv.ts /
                             email.ts here as you wire up new source types)
                             + dedupe.ts (§16)
lib/ai/                   → gemini.ts (thin client), classify.ts (§18-19),
                             analyze-impact.ts (§20-23, §27-28),
                             generate-brief.ts (§30)
lib/intelligence/
    pipeline.ts            → orchestrates collect → dedupe → classify →
                             analyze → store → brief (the MVP loop, §53);
                             exports runCollectionForSource,
                             processUnanalyzedRawDocuments, and
                             runDailyBriefing, each callable standalone or
                             chained together (used by both
                             app/api/cron/daily and the individual routes)
    queries.ts             → read helpers used directly by dashboard
                             Server Components
app/api/cron/daily/*       → Hobby-plan-friendly combined cron (see §2 above)
app/api/cron/*             → the original per-stage scheduled jobs from §44,
                             kept working standalone for when you're on Pro
app/api/*                  → read-only REST endpoints backing the dashboard
app/dashboard/*             → one page per domain from §32-41
components/                → EventCard, ScoreBadge/LevelBadge, EmptyState, Sidebar
```

### Why two separate AI calls per event (classify, then analyze-impact)?
Keeps each prompt focused and each JSON schema small and reliable, keeps
an audit trail per stage (`ai_analysis` collection, §49), and means you can
swap the impact-analysis prompt (e.g. tune the risk/opportunity weighting)
without touching extraction at all.

### Why is Firebase Admin lazily initialized?
`lib/firebase/admin.ts` only reads credentials the first time `getAdminDb()`
is actually called — not at module import time. Next.js imports every route
module during `next build`; eager initialization would make the build fail
whenever env vars aren't present in the build environment. This also means
a genuinely missing-credentials error only ever surfaces as a clear runtime
error on the specific request that needed it, not as an opaque build failure.

### Cost control (§51)
The `analyze` cron processes documents in small batches (20 by default) and
only calls the more expensive impact-analysis prompt for documents the
classifier judged relevant. Tune `processUnanalyzedRawDocuments(limit)` in
`lib/intelligence/pipeline.ts` once you've measured real latency/cost per
batch on your source volume.

---

## 4. Extending the source network (Phase 5)

> **Before adding sources: know your actual bottleneck.** Collecting from
> more sources costs nothing against your Gemini quota — but *analyzing*
> what's collected does (2 AI calls/document), and the free tier caps that
> at ~20 requests/day total. More sources means a longer backlog queue,
> not a faster-filling dashboard. Only add sources you actually want
> covered long-term, not "more is better."
>
> **Verify the RSS URL actually works before adding it.** Government and
> international-org sites are frequently unreliable — WTO, IMF, and EAC's
> official feeds have all 404'd or 403'd in production despite looking
> right on paper. Don't guess a `/rss` or `/feed` path from a homepage URL;
> search for the org's actual documented RSS endpoint (or check
> `https://rss.feedspot.com/` for a category list of verified feeds) before
> committing it to `config/sources.ts` — a wrong URL doesn't fail loudly,
> it just silently 404s in your pipeline run every day.

Adding a source never requires touching the pipeline. Steps:

1. Add an entry to `SEED_SOURCES` in `config/sources.ts` with the right `domains`, `tier`, and `collectionMethod`.
2. If the `collectionMethod` isn't `"rss"` yet, add a sibling collector module in `lib/collectors/` (e.g. `api.ts`, `web-scrape.ts`, `pdf.ts`) following the exact shape of `collectFromRss()` in `lib/collectors/rss.ts`, then add one line to the `switch` in `collectFromSource()`.
3. Re-run `npm run seed:sources`.
4. Trigger `/api/cron/collect` (or wait for the schedule) — the new source flows through dedupe → classify → analyze automatically.

---

## 5. Next build priorities (recommended order)

1. **Phase 9 — Alerts**: implement `app/api/cron/alerts/route.ts`, then add a delivery channel (email via Resend/SendGrid, or a Slack webhook) in a new `lib/alerts/notify.ts`.
2. **Weekly report** (§31): copy the pattern in `lib/ai/generate-brief.ts` and `app/api/cron/briefings/route.ts`, aggregating a week of daily briefs + events instead of 24h of events.
3. **Phase 11 — AI Investigation assistant** (§43): a chat endpoint that retrieves relevant events (start with Firestore filters, upgrade to a vector search over event summaries) and answers with citations to `eventId`s, in the same voice as the daily brief.
4. **Upgrade aggregation to AI-synthesized clustering** once your Gemini quota allows: `lib/intelligence/aggregation.ts` currently clusters by shared category/sector/domain and reuses per-event AI text rather than spending quota on a fresh summarization pass per cluster (see that file's header comment). A dedicated LLM call per cluster would produce better-written titles/descriptions and could do semantic (not just rule-based) grouping.
