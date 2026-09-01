import Link from "next/link";

const NAV_GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Main Dashboard" }],
  },
  {
    label: "Geography",
    items: [
      { href: "/dashboard/kenya", label: "Kenya" },
      { href: "/dashboard/regional", label: "Regional (EAC / Africa)" },
      { href: "/dashboard/global", label: "Global" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/dashboard/trends", label: "Trends" },
      { href: "/dashboard/risks", label: "Risks" },
      { href: "/dashboard/opportunities", label: "Opportunities" },
      { href: "/dashboard/intelligence", label: "Daily Brief" },
    ],
  },
  {
    label: "Sectors & Trade",
    items: [
      { href: "/dashboard/trade", label: "Trade & Logistics" },
      { href: "/dashboard/labour", label: "Labour" },
      { href: "/dashboard/sectors", label: "Sectors" },
    ],
  },
  {
    label: "System",
    items: [{ href: "/dashboard/settings", label: "Sources & Settings" }],
  },
];

export function Sidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-base-700 bg-base-900 h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-6 border-b border-base-700">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-amber opacity-60"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-signal-amber"></span>
          </span>
          <span className="font-display text-lg tracking-tight text-ink-100">
            Business Trend Watch
          </span>
        </div>
        <p className="eyebrow mt-2">Kenya · East Africa · Africa · Global</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="eyebrow px-2 mb-2">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-2 py-1.5 rounded-md text-sm text-ink-300 hover:bg-base-800 hover:text-ink-100 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
