import clsx from "clsx";

const LEVEL_COLORS: Record<string, string> = {
  low: "text-ink-500 border-base-600",
  medium: "text-signal-info border-signal-info/40",
  high: "text-signal-amber border-signal-amber/40",
  critical: "text-signal-risk border-signal-risk/40",
};

export function LevelBadge({ level, label }: { level: string; label?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-mono uppercase tracking-wide",
        LEVEL_COLORS[level] ?? LEVEL_COLORS.low
      )}
    >
      {label ?? level}
    </span>
  );
}

export function ScoreBar({ label, value, tone }: { label: string; value: number; tone: "risk" | "opportunity" | "info" }) {
  const color =
    tone === "risk" ? "bg-signal-risk" : tone === "opportunity" ? "bg-signal-opportunity" : "bg-signal-info";
  return (
    <div>
      <div className="flex justify-between text-[11px] font-mono text-ink-500 mb-1">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-base-700 overflow-hidden">
        <div className={clsx("h-full rounded-full", color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}
