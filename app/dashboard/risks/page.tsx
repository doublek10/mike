import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { LevelBadge } from "@/components/dashboard/ScoreBadge";
import type { Risk } from "@/types";

export const dynamic = "force-dynamic";

async function getRisks(): Promise<Risk[]> {
  try {
    const snap = await getAdminDb().collection(COLLECTIONS.RISKS).orderBy("riskScore", "desc").limit(50).get();
    return snap.docs.map((d) => d.data() as Risk);
  } catch {
    return [];
  }
}

export default async function RisksDashboardPage() {
  const risks = await getRisks();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Intelligence</p>
        <h1 className="font-display text-2xl text-ink-100 mt-1">Risks</h1>
        <p className="text-sm text-ink-500 mt-1">
          Regulatory · political · labour · supply-chain · commodity · currency · trade · investment ·
          infrastructure · geopolitical · market
        </p>
      </header>

      {risks.length === 0 ? (
        <EmptyState
          title="No standalone risks recorded yet"
          hint="The risk engine runs automatically on every pipeline run (see lib/intelligence/aggregation.ts), promoting events with riskScore ≥ 55 into named, tracked risks grouped by category and sector. None currently qualify — check individual event cards for their riskScore, or click 'Run pipeline now' after more events are analyzed."
        />
      ) : (
        <div className="space-y-3">
          {risks.map((r) => (
            <article key={r.id} className="panel p-4 flex items-center justify-between">
              <div>
                <p className="eyebrow">{r.category.replace("_", " ")}</p>
                <h3 className="font-display text-base text-ink-100 mt-1">{r.title}</h3>
                <p className="text-sm text-ink-300 mt-1 max-w-2xl">{r.description}</p>
              </div>
              <div className="text-right space-y-1">
                <LevelBadge level={r.severity} />
                <p className="text-[11px] font-mono text-ink-500">score {r.riskScore}/100</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
