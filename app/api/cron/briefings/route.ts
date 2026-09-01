import { NextRequest, NextResponse } from "next/server";
import { runDailyBriefing } from "@/lib/intelligence/pipeline";

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

  const result = await runDailyBriefing();

  if (!result.generated) {
    return NextResponse.json({ message: result.message });
  }

  return NextResponse.json({ ranAt: result.brief.generatedAt, brief: result.brief });
}
