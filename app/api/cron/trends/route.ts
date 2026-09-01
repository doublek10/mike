import { NextRequest, NextResponse } from "next/server";
import { runAggregation } from "@/lib/intelligence/aggregation";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * Runs the sector/risk/opportunity/trend aggregation engine on its own,
 * without also running collect/analyze/briefing. Useful if you want to
 * refresh these views without spending any part of your Gemini quota —
 * this route makes zero AI calls (see lib/intelligence/aggregation.ts).
 *
 * /api/cron/daily already runs this as its last step on every scheduled
 * or manual run, so you don't need to hit this separately in normal use —
 * it's here for cases like "I just want to re-cluster without waiting for
 * a full pipeline run."
 */
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && !isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runAggregation();
  return NextResponse.json(result);
}
