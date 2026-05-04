/**
 * Loading skeleton da /hoje — KPIs + sections de leads agrupadas por urgência.
 */
export default function HojeLoading() {
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
          <div className="h-4 w-48 rounded-md bg-secondary/70 dark:bg-white/[0.03] animate-pulse" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-3 animate-pulse" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="w-9 h-9 rounded-lg bg-secondary dark:bg-white/[0.05]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-16 rounded bg-secondary dark:bg-white/[0.05]" />
              <div className="h-6 w-10 rounded bg-secondary/80 dark:bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>

      {/* Sections — 2 grupos com 3 leads cada */}
      {Array.from({ length: 2 }).map((_, sec) => (
        <section key={sec} className="mb-6">
          <div className="h-3 w-32 rounded bg-secondary dark:bg-white/[0.05] mb-2 animate-pulse" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="card p-4 flex items-center gap-3 animate-pulse"
                style={{ animationDelay: `${sec * 200 + i * 40}ms` }}
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-32 rounded bg-secondary dark:bg-white/[0.05]" />
                    <div className="h-3.5 w-16 rounded bg-secondary/70 dark:bg-white/[0.03]" />
                  </div>
                  <div className="h-3 w-2/3 rounded bg-secondary/60 dark:bg-white/[0.03]" />
                </div>
                <div className="h-7 w-28 rounded bg-secondary dark:bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
