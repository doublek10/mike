import { getRecentEvents, getTodaysBrief } from "@/lib/intelligence/queries";
import { EventCard } from "@/components/dashboard/EventCard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const dynamic = "force-dynamic";

// Exposure read-out for the three summary tiles below. Framed the way an
// analyst would read a risk heatmap: a plain severity label plus a dot,
// not a raw 0-100 score, since the number alone doesn't tell you whether
// 55 is "watch it" or "act on it".
function exposureLevel(avgScore: number): { label: string; dot: string; text: string } {
  if (avgScore >= 70) return { label: "Elevated", dot: "bg-signal-risk", text: "text-signal-risk" };
  if (avgScore >= 40) return { label: "Moderate", dot: "bg-signal-amber", text: "text-signal-amber" };
  return { label: "Low", dot: "bg-signal-opportunity", text: "text-signal-opportunity" };
}

export default async function MainDashboardPage() {
  const [events, brief] = await Promise.all([getRecentEvents({ limit: 40 }), getTodaysBrief()]);

  const highPriority = events
    .filter((e) => e.scores.importance >= 70)
    .sort((a, b) => b.scores.importance - a.scores.importance)
    .slice(0, 6);

  const avgKenya = events.length
    ? events.reduce((sum, e) => sum + e.scores.kenyaRelevance, 0) / events.length
    : 0;
  const avgRegional = events.length
    ? events.reduce(
        (sum, e) => sum + (e.impact.regionalImpact === "high" || e.impact.regionalImpact === "critical" ? 80 : 30),
        0
      ) / events.length
    : 0;
  const avgGlobal = events.length
    ? events.reduce(
        (sum, e) => sum + (e.impact.globalImpact === "high" || e.impact.globalImpact === "critical" ? 80 : 30),
        0
      ) / events.length
    : 0;

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Overview</p>
        <h1 className="font-display text-2xl text-ink-100 mt-1">Main Dashboard</h1>
      </header>

      <section className="grid grid-cols-3 gap-4">
        {[
          { label: "Kenya", value: avgKenya },
          { label: "Regional", value: avgRegional },
          { label: "Global", value: avgGlobal },
        ].map((row) => {
          const exposure = events.length ? exposureLevel(row.value) : null;
          return (
            <div key={row.label} className="panel p-5 flex items-center justify-between">
              <div>
                <p className="eyebrow">{row.label}</p>
                <p className="font-display text-xl text-ink-100 mt-1">
                  {events.length ? Math.round(row.value) : "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${exposure ? exposure.dot : "bg-base-600"}`} />
                <span className={`text-xs font-mono ${exposure ? exposure.text : "text-ink-500"}`}>
                  {exposure ? exposure.label : "No data"}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="eyebrow mb-3">High Priority Events</h2>
        {highPriority.length === 0 ? (
          <EmptyState
            title="No high-priority events yet"
            hint="Run /api/cron/collect then /api/cron/analyze to populate the pipeline, or wait for the scheduled Vercel Cron runs."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {highPriority.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-3">AI Daily Brief</h2>
        {!brief ? (
          <EmptyState
            title="Today's brief hasn't been generated yet"
            hint="It runs automatically once a day via Vercel Cron (/api/cron/briefings), after enough events have been analyzed."
          />
        ) : (
          <div className="panel p-5 space-y-4">
            <div>
              <p className="eyebrow mb-2">Top developments</p>
              <ul className="space-y-2">
                {brief.topDevelopments.map((d, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-ink-100 font-medium">{d.headline}</span>
                    <span className="text-ink-500"> — {d.whyItMatters}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm text-ink-300 pt-3 border-t border-base-700">
              <div>
                <p className="eyebrow mb-1">Kenya</p>
                {brief.kenyaImplications}
              </div>
              <div>
                <p className="eyebrow mb-1">Regional</p>
                {brief.regionalImplications}
              </div>
              <div>
                <p className="eyebrow mb-1">Global</p>
                {brief.globalImplications}
              </div>
            </div>

            {(brief.emergingOpportunities.length > 0 || brief.emergingRisks.length > 0) && (
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-base-700">
                <div>
                  <p className="eyebrow mb-2 text-signal-opportunity">Emerging opportunities</p>
                  {brief.emergingOpportunities.length === 0 ? (
                    <p className="text-xs text-ink-500">None flagged today.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm text-ink-300 list-disc list-inside">
                      {brief.emergingOpportunities.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="eyebrow mb-2 text-signal-risk">Emerging risks</p>
                  {brief.emergingRisks.length === 0 ? (
                    <p className="text-xs text-ink-500">None flagged today.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm text-ink-300 list-disc list-inside">
                      {brief.emergingRisks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-3">What to Watch Next</h2>
        {!brief || brief.whatToWatchNext.length === 0 ? (
          <EmptyState title="Nothing flagged yet" hint="Populated by the daily brief once generated." />
        ) : (
          <ul className="panel p-5 space-y-1 text-sm text-ink-300 list-disc list-inside">
            {brief.whatToWatchNext.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
