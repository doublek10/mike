import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { Source } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/sources — list the source registry with health status. */
export async function GET() {
  const snapshot = await getAdminDb().collection(COLLECTIONS.SOURCES).get();
  const sources = snapshot.docs.map((d) => d.data() as Source);
  return NextResponse.json({ sources, count: sources.length });
}
