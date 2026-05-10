/**
 * Loading skeleton do /funil — bars + cards + tabelas múltiplas.
 */
export default function FunilLoading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <div className="space-y-2">
          <div className="h-7 w-24 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
          <div className="h-4 w-96 rounded-md bg-secondary/70 dark:bg-white/[0.03] animate-pulse" />
        </div>
        <div className="h-8 w-44 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
      </header>

      {/* Topline cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 animate-pulse" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="h-3 w-24 rounded bg-secondary dark:bg-white/[0.05] mb-2" />
            <div className="h-7 w-16 rounded bg-secondary/80 dark:bg-white/[0.04] mb-1" />
            <div className="h-3 w-20 rounded bg-secondary/60 dark:bg-white/[0.03]" />
          </div>
        ))}
      </section>

      {/* Forecast section */}
      <section className="card p-5 mb-6 animate-pulse">
        <div className="h-5 w-64 rounded bg-secondary dark:bg-white/[0.05] mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-4 space-y-2">
              <div className="h-3 w-16 rounded bg-secondary dark:bg-white/[0.05]" />
              <div className="h-7 w-24 rounded bg-secondary/80 dark:bg-white/[0.04]" />
              <div className="h-3 w-32 rounded bg-secondary/60 dark:bg-white/[0.03]" />
            </div>
          ))}
        </div>
      </section>

      {/* Funnel bars */}
      <section className="card p-5 mb-6 animate-pulse">
        <div className="h-5 w-48 rounded bg-secondary dark:bg-white/[0.05] mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="w-36 h-3 rounded bg-secondary/70 dark:bg-white/[0.03]" />
              <div className="flex-1 h-8 rounded bg-secondary/80 dark:bg-white/[0.04]" />
              <div className="w-20 h-3 rounded bg-secondary/70 dark:bg-white/[0.03]" />
            </div>
          ))}
        </div>
      </section>

      {/* Two columns: tempo + valor */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {Array.from({ length: 2 }).map((_, c) => (
          <div key={c} className="card p-5 animate-pulse">
            <div className="h-5 w-48 rounded bg-secondary dark:bg-white/[0.05] mb-4" />
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-36 h-3 rounded bg-secondary/70 dark:bg-white/[0.03]" />
                  <div className="flex-1 h-6 rounded bg-secondary/80 dark:bg-white/[0.04]" />
                  <div className="w-24 h-3 rounded bg-secondary/70 dark:bg-white/[0.03]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
