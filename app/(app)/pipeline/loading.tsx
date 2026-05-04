/**
 * Loading skeleton específico do kanban — colunas em vez de lista vertical.
 */
export default function PipelineLoading() {
  return (
    <div className="py-4 animate-in fade-in duration-150">
      <header className="px-4 md:px-8 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
          <div className="h-4 w-72 rounded-md bg-secondary/70 dark:bg-white/[0.03] animate-pulse" />
        </div>
        <div className="h-8 w-28 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
      </header>

      {/* Toolbar skeleton */}
      <div className="px-4 md:px-8 mb-4 flex gap-2">
        <div className="h-8 w-56 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
        <div className="h-8 w-36 rounded-md bg-secondary/80 dark:bg-white/[0.04] animate-pulse" />
        <div className="h-8 w-28 rounded-md bg-secondary/80 dark:bg-white/[0.04] animate-pulse" />
      </div>

      {/* Kanban columns skeleton */}
      <div className="flex gap-3 overflow-x-auto pb-4 px-4 md:px-8">
        {Array.from({ length: 6 }).map((_, col) => (
          <div
            key={col}
            className="min-w-[280px] w-[280px] flex flex-col rounded-xl border border-border bg-secondary/40 dark:bg-white/[0.02] animate-pulse"
            style={{ animationDelay: `${col * 80}ms` }}
          >
            {/* Column header */}
            <div className="px-3 py-2 border-b border-border dark:border-white/[0.06] space-y-1.5">
              <div className="h-3 w-24 rounded bg-secondary dark:bg-white/[0.06]" />
              <div className="h-2.5 w-16 rounded bg-secondary/70 dark:bg-white/[0.04]" />
            </div>
            {/* Cards skeleton */}
            <div className="p-2 space-y-2">
              {Array.from({ length: col % 2 === 0 ? 3 : 2 }).map((_, i) => (
                <div
                  key={i}
                  className="card p-3 space-y-2"
                  style={{ animationDelay: `${col * 80 + i * 40 + 100}ms` }}
                >
                  <div className="h-3.5 w-3/4 rounded bg-secondary dark:bg-white/[0.05]" />
                  <div className="h-3 w-1/2 rounded bg-secondary/70 dark:bg-white/[0.03]" />
                  <div className="flex gap-1.5 pt-1">
                    <div className="h-3.5 w-12 rounded bg-secondary/70 dark:bg-white/[0.03]" />
                    <div className="h-3.5 w-10 rounded bg-secondary/70 dark:bg-white/[0.03]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
