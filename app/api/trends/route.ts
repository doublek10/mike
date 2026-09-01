import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";

export const dynamic = "force-dynamic";

/**
 * GET /api/trends
 * Reads from the `trends` collection. Returns an empty array until the
 * corresponding engine (see /api/cron/trends or the relevant lib/intelligence
 * module) has been implemented and populated it -- the dashboard is built
 * to render an empty state gracefully in the meantime.
 */
export async function GET() {
  const snapshot = await getAdminDb().collection(COLLECTIONS.TRENDS).limit(100).get();
  const items = snapshot.docs.map((d) => d.data());
  return NextResponse.json({ items, count: items.length });
}
