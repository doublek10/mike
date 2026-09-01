import { NextRequest, NextResponse } from "next/server";
import { processUnanalyzedRawDocuments } from "@/lib/intelligence/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && !isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Batch size kept small deliberately (§51 cost control) — each item does
  // two Claude calls. Increase once you've validated cost/latency in prod,
  // or shard across multiple cron invocations.
  const result = await processUnanalyzedRawDocuments(20);

  return NextResponse.json({ ranAt: new Date().toISOString(), ...result });
}
