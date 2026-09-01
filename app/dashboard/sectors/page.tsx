import { getAdminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { Sector } from "@/types";

export const dynamic = "force-dynamic";

const INITIAL_SECTORS = [
  "Agriculture", "Manufacturing", "Construction", "Transport", "Logistics", "Retail",
  "Real estate", "Tourism", "Hospitality", "Energy", "Mining", "Technology",
  "Financial services", "Healthcare", "Education", "Telecommunications",
];

async function getSectors(): Promise<Sector[]> {
  try {
    const snap = await getAdminDb().collection(COLLECTIONS.SECTORS).get();
    return snap.docs.map((d) => d.data() as Sector);
  } catch {
    return [];
  }
}

export default async function SectorsDashboardPage() {
  const sectors = await getSectors();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Domain 7</p>
        <h1 className="font-display text-2xl text-ink-100 mt-1">Sector Intelligence</h1>
      </header>

      {sectors.length === 0 ? (
        <>
          <EmptyState
            title="No sector profiles yet"
            hint="Sector profiles refresh automatically on every pipeline run (see lib/intelligence/aggregation.ts) from events whose affectedSectors tag matches one of the sectors below. None have qualifying events yet — click 'Run pipeline now' after more events are analyzed."
          />
          <div className="flex flex-wrap gap-2 pt-2">
            {INITIAL_SECTORS.map((s) => (
              <span key={s} className="text-[11px] font-mono px-2 py-1 rounded bg-base-800 text-ink-500">
                {s}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {sectors.map((s) => (
            <article key={s.id} className="panel p-4">
              <h3 className="font-display text-base text-ink-100">{s.name}</h3>
              <p className="text-sm text-ink-300 mt-1">{s.currentTrend}</p>
              <p className="text-[11px] font-mono text-ink-500 mt-2">
                {s.direction} · confidence {s.confidence}/100
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
