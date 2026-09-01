import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { Trend } from "@/types";

export const dynamic = "force-dynamic";

async function getTrends(): Promise<Trend[]> {
  try {
    const snap = await getAdminDb().collection(COLLECTIONS.TRENDS).limit(50).get();
    return snap.docs.map((d) => d.data() as Trend);
  } catch {
    return [];
  }
}

export default async function TrendsDashboardPage() {
  const trends = await getTrends();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Intelligence</p>
        <h1 className="font-display text-2xl text-ink-100 mt-1">Trends</h1>
        <p className="text-sm text-ink-500 mt-1">
          Cross-event patterns detected over time — not a single article, but the convergence of several.
        </p>
      </header>

      {trends.length === 0 ? (
        <EmptyState
          title="No trends detected yet"
          hint="The trend engine runs automatically on every pipeline run (see lib/intelligence/aggregation.ts) — but a trend needs at least 2 analyzed events sharing a domain + sector before it counts as a pattern rather than a single article. Check back as more events get analyzed, or click 'Run pipeline now'."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {trends.map((t) => (
            <article key={t.id} className="panel p-4">
              <p className="eyebrow">{t.domains.join(" · ")}</p>
              <h3 className="font-display text-base text-ink-100 mt-1">{t.title}</h3>
              <p className="text-sm text-ink-300 mt-2">{t.description}</p>
              <p className="text-[11px] font-mono text-ink-500 mt-3">
                {t.direction} · strength {t.strength}/100 · {t.timeHorizon.replace("_", " ")}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
