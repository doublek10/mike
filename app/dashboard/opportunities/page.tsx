import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { Opportunity } from "@/types";

export const dynamic = "force-dynamic";

async function getOpportunities(): Promise<Opportunity[]> {
  try {
    const snap = await getAdminDb()
      .collection(COLLECTIONS.OPPORTUNITIES)
      .orderBy("opportunityScore", "desc")
      .limit(50)
      .get();
    return snap.docs.map((d) => d.data() as Opportunity);
  } catch {
    return [];
  }
}

export default async function OpportunitiesDashboardPage() {
  const opportunities = await getOpportunities();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Intelligence</p>
        <h1 className="font-display text-2xl text-ink-100 mt-1">Opportunities</h1>
        <p className="text-sm text-ink-500 mt-1">
          New markets · product demand · investment · supply shortages · trade agreements · policy incentives
        </p>
      </header>

      {opportunities.length === 0 ? (
        <EmptyState
          title="No standalone opportunities recorded yet"
          hint="The opportunity engine runs automatically on every pipeline run (see lib/intelligence/aggregation.ts), promoting events with opportunityScore ≥ 55 into named, tracked opportunities grouped by sector and market. None currently qualify — check individual event cards for their opportunityScore, or click 'Run pipeline now' after more events are analyzed."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {opportunities.map((o) => (
            <article key={o.id} className="panel p-4">
              <p className="eyebrow">
                {o.sector} · {o.market}
              </p>
              <h3 className="font-display text-base text-ink-100 mt-1">{o.title}</h3>
              <p className="text-sm text-ink-300 mt-2">{o.reason}</p>
              <p className="text-[11px] font-mono text-ink-500 mt-3">
                score {o.opportunityScore}/100 · confidence {o.confidence}/100 · {o.timeHorizon.replace("_", " ")}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
