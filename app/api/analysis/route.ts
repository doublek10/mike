import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";

export const dynamic = "force-dynamic";

/** GET /api/analysis?eventId=... — audit trail of AI calls behind an event (§49). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");

  let query = getAdminDb().collection(COLLECTIONS.AI_ANALYSIS).orderBy("createdAt", "desc").limit(50);
  if (eventId) {
    query = getAdminDb()
      .collection(COLLECTIONS.AI_ANALYSIS)
      .where("eventId", "==", eventId) as typeof query;
  }

  const snapshot = await query.get();
  const items = snapshot.docs.map((d) => d.data());
  return NextResponse.json({ items, count: items.length });
}
