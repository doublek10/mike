import { getRecentEvents } from "@/lib/intelligence/queries";
import { EventCard } from "@/components/dashboard/EventCard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const dynamic = "force-dynamic";

export default async function TradePage() {
  const domains = ["trade_logistics"] as const;
  const eventLists = await Promise.all(domains.map((d) => getRecentEvents({ domain: d, limit: 20 })));
  const events = eventLists
    .flat()
    .sort((a, b) => (b.analyzedAt ?? "").localeCompare(a.analyzedAt ?? ""));

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Domain 6</p>
        <h1 className="font-display text-2xl text-ink-100 mt-1">Trade & Logistics</h1>
        <p className="text-sm text-ink-500 mt-1">Imports · exports · ports · shipping · customs · corridors · LAPSSET</p>
      </header>

      {events.length === 0 ? (
        <EmptyState title="No events yet" hint="Add port authority / logistics sources in config/sources.ts and run the collect + analyze cron routes." />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
