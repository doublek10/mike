import { getSources } from "@/lib/intelligence/queries";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sources = await getSources();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">System</p>
        <h1 className="font-display text-2xl text-ink-100 mt-1">Sources & Settings</h1>
        <p className="text-sm text-ink-500 mt-1">
          The source registry (§6). Run <code className="font-mono text-ink-300">npm run seed:sources</code> to
          populate this from config/sources.ts.
        </p>
      </header>

      {sources.length === 0 ? (
        <EmptyState
          title="No sources registered yet"
          hint="Run: npm run seed:sources — this loads the starter registry from config/sources.ts into Firestore."
        />
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left eyebrow border-b border-base-700">
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reliability</th>
                <th className="px-4 py-3">Last Run</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b border-base-800 last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-ink-100">{s.name}</p>
                    <p className="text-ink-500 text-xs">{s.domains.join(", ")}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-300">T{s.tier}</td>
                  <td className="px-4 py-3 font-mono text-ink-300">{s.collectionMethod}</td>
                  <td className="px-4 py-3 font-mono text-ink-300">{s.reliabilityRating}</td>
                  <td className="px-4 py-3 font-mono text-ink-500 text-xs">
                    {s.lastSuccessfulCollection ? new Date(s.lastSuccessfulCollection).toLocaleString() : "never"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={s.lastFailure && !s.lastSuccessfulCollection ? "text-signal-risk" : "text-signal-opportunity"}>
                      {s.active ? "active" : "inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
