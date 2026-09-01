export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="panel p-8 text-center">
      <p className="font-display text-ink-300">{title}</p>
      <p className="text-sm text-ink-500 mt-2 max-w-md mx-auto">{hint}</p>
    </div>
  );
}
