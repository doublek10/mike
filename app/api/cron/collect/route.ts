import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { runCollectionForSource } from "@/lib/intelligence/pipeline";
import type { Source } from "@/types";

export const dynamic = "force-dynamic";

export const maxDuration = 60; // Vercel Function limit for this route

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron sends this header automatically; also allow a manual
  // Bearer token for local testing (CRON_SECRET env var).
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && !isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getAdminDb()
    .collection(COLLECTIONS.SOURCES)
    .where("active", "==", true)
    .get();

  const sources = snapshot.docs.map((d) => d.data() as Source);

  const results = await Promise.allSettled(
    sources.map((source) => runCollectionForSource(source))
  );

  const summary = results.map((r, i) => ({
    sourceId: sources[i].id,
    sourceName: sources[i].name,
    status: r.status,
    ...(r.status === "fulfilled" ? { run: r.value } : { error: String(r.reason) }),
  }));

  return NextResponse.json({ ranAt: new Date().toISOString(), sourcesRun: sources.length, summary });
}
