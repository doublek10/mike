import { getSystemStatus } from "@/lib/intelligence/queries";

const LEVEL_STYLES = {
  ok: { dot: "bg-signal-opportunity", ring: "bg-signal-opportunity", text: "text-signal-opportunity", border: "border-signal-opportunity/40" },
  warning: { dot: "bg-signal-amber", ring: "bg-signal-amber", text: "text-signal-amber", border: "border-signal-amber/40" },
  error: { dot: "bg-signal-risk", ring: "bg-signal-risk", text: "text-signal-risk", border: "border-signal-risk/40" },
} as const;

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Server Component — fetches its own data so it can sit in the shared
// dashboard layout without every page needing to pass status down.
// Uses <details>/<summary> for the expandable panel instead of client-side
// state, so this stays a zero-JS server component.
export async function SystemStatusBadge() {
  const status = await getSystemStatus();
  const style = LEVEL_STYLES[status.level];

  return (
    <details className="group relative">
      <summary
        className={`list-none flex items-center gap-2 px-3 py-1.5 rounded-full border ${style.border} bg-base-900 cursor-pointer select-none`}
      >
        <span className="relative flex h-2 w-2">
          {status.level === "ok" && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${style.ring} opacity-60`} />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${style.dot}`} />
        </span>
        <span className={`text-xs font-mono ${style.text}`}>{status.headline}</span>
      </summary>

      <div className="absolute right-0 mt-2 w-96 panel p-4 z-50 shadow-xl">
        <p className={`text-sm font-medium ${style.text}`}>{status.headline}</p>
        <p className="text-xs text-ink-500 mt-1 break-words">{status.detail}</p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 pt-3 border-t border-base-700 text-xs">
          <div>
            <p className="eyebrow">Sources</p>
            <p className="text-ink-100 mt-0.5">
              {status.stats.sourcesActive} active / {status.stats.sourcesTotal} total
            </p>
          </div>
          <div>
            <p className="eyebrow">Events</p>
            <p className="text-ink-100 mt-0.5">{status.stats.eventsTotal} collected</p>
          </div>
          <div>
            <p className="eyebrow">Pending analysis</p>
            <p className="text-ink-100 mt-0.5">{status.stats.docsPendingAnalysis} docs</p>
          </div>
          <div>
            <p className="eyebrow">Last brief</p>
            <p className="text-ink-100 mt-0.5">{status.stats.lastBriefDate ?? "none yet"}</p>
          </div>
          <div>
            <p className="eyebrow">Last run</p>
            <p className="text-ink-100 mt-0.5">
              {relativeTime(status.stats.lastRunAt)}
              {status.stats.lastRunStatus ? ` · ${status.stats.lastRunStatus}` : ""}
            </p>
          </div>
          <div>
            <p className="eyebrow">Gemini key</p>
            <p className="text-ink-100 mt-0.5">{status.stats.geminiConfigured ? "configured" : "missing"}</p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-base-700">
          <p className="eyebrow mb-2">Environment variables (this runtime)</p>
          <ul className="space-y-1 text-xs font-mono">
            {status.env.map((e) => (
              <li key={e.name} className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    e.set ? "bg-signal-opportunity" : "bg-signal-risk"
                  }`}
                />
                <span className={e.set ? "text-ink-500" : "text-ink-100"}>{e.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
