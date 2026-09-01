import { getRecentEvents } from "@/lib/intelligence/queries";
import { EventCard } from "@/components/dashboard/EventCard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const dynamic = "force-dynamic";

export default async function RegionalPage() {
  const domains = ["east_africa", "africa"] as const;
  const eventLists = await Promise.all(domains.map((d) => getRecentEvents({ domain: d, limit: 20 })));
  const events = eventLists
    .flat()
    .sort((a, b) => (b.analyzedAt ?? "").localeCompare(a.analyzedAt ?? ""));

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Domain 3 & 4</p>
        <h1 className="font-display text-2xl text-ink-100 mt-1">Regional (EAC / Africa)</h1>
        <p className="text-sm text-ink-500 mt-1">EAC · SADC · TFTA · AfCFTA · COMESA · IGAD · other African markets</p>
      </header>

      {events.length === 0 ? (
        <EmptyState title="No events yet" hint="Add EAC/AfCFTA/COMESA sources in config/sources.ts and run the collect + analyze cron routes." />
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
