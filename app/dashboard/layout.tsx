import { Sidebar } from "@/components/layout/Sidebar";
import { SystemStatusBadge } from "@/components/layout/SystemStatusBadge";
import { RunPipelineButton } from "@/components/layout/RunPipelineButton";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen">
        <div className="sticky top-0 z-40 flex items-center justify-end gap-3 px-8 py-4 bg-base-950/80 backdrop-blur border-b border-base-700">
          <RunPipelineButton />
          <SystemStatusBadge />
        </div>
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
