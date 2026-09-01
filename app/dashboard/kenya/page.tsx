import { getRecentEvents } from "@/lib/intelligence/queries";
import { EventCard } from "@/components/dashboard/EventCard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const dynamic = "force-dynamic";

export default async function KenyaDashboardPage() {
  const events = await getRecentEvents({ domain: "kenya", limit: 40 });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Domain 1</p>
        <h1 className="font-display text-2xl text-ink-100 mt-1">Kenya</h1>
        <p className="text-sm text-ink-500 mt-1">
          Government · Economy · Policy · Tax · Regulation · Business · Labour · Trade · Investment · Infrastructure
        </p>
      </header>

      {events.length === 0 ? (
        <EmptyState
          title="No Kenya-domain events yet"
          hint="Add Kenya sources in config/sources.ts and run the collect + analyze cron routes."
        />
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
