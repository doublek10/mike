import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { Domain, Event } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/events?domain=kenya&limit=50
 * Read-only endpoint backing the dashboard. Filters are intentionally
 * simple (single domain via array-contains) — for compound filtering,
 * add composite Firestore indexes as needed and extend this handler.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain") as Domain | null;
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  let query = getAdminDb().collection(COLLECTIONS.EVENTS).orderBy("analyzedAt", "desc").limit(limit);

  if (domain) {
    query = getAdminDb()
      .collection(COLLECTIONS.EVENTS)
      .where("domains", "array-contains", domain)
      .orderBy("analyzedAt", "desc")
      .limit(limit) as typeof query;
  }

  const snapshot = await query.get();
  const events = snapshot.docs.map((d) => d.data() as Event);

  return NextResponse.json({ events, count: events.length });
}
