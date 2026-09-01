import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { DailyBrief } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/briefings?date=2026-08-29 — defaults to today's brief. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const doc = await getAdminDb().collection(COLLECTIONS.DAILY_BRIEFS).doc(date).get();
  if (!doc.exists) {
    return NextResponse.json({ brief: null, message: `No brief generated for ${date} yet.` });
  }
  return NextResponse.json({ brief: doc.data() as DailyBrief });
}
