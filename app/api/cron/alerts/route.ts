import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * §29 Alert Engine — ROADMAP STUB.
 *
 * Not implemented in this MVP. Implementation plan (Phase 9):
 *   1. After /api/cron/analyze runs, scan newly created events where
 *      scores.importance >= 80 OR scores.riskScore >= 80 OR
 *      scores.opportunityScore >= 85.
 *   2. Also scan for "multiple related events" — 3+ new events sharing a
 *      domain/sector within a short window (a cheap precursor to full
 *      trend detection).
 *   3. Write an Alert document with severity derived from the score
 *      thresholds above, referencing the triggering eventIds.
 *   4. Delivery (email/Slack/webhook) is a separate concern — keep this
 *      route only responsible for detecting & persisting alerts, and add
 *      a notification dispatcher in lib/alerts/notify.ts that reads
 *      newly created, unacknowledged alerts.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "not_implemented",
      note: "See comment in this file for the implementation plan (Phase 9).",
    },
    { status: 501 }
  );
}
