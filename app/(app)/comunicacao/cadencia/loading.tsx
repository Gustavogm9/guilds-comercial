/**
 * Loading skeleton da /cadencia — KPIs + 6 colunas (D0 → D30).
 */
export default function CadenciaLoading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-150">
      <header className="mb-4 space-y-2">
        <div className="h-7 w-40 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
        <div className="h-4 w-96 rounded-md bg-secondary/70 dark:bg-white/[0.03] animate-pulse" />
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
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

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="h-8 w-64 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
        <div className="h-8 w-40 rounded-md bg-secondary/80 dark:bg-white/[0.04] animate-pulse" />
        <div className="h-8 w-20 rounded-md bg-secondary/80 dark:bg-white/[0.04] animate-pulse" />
      </div>

      {/* 6 colunas */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {["D0","D3","D7","D11","D16","D30"].map((p, col) => (
          <div
            key={p}
            className="min-w-[300px] w-[300px] flex flex-col rounded-xl border border-border bg-secondary/40 dark:bg-white/[0.02] animate-pulse"
            style={{ animationDelay: `${col * 80}ms` }}
          >
            <div className="px-3 py-2 border-b border-border dark:border-white/[0.06] space-y-1">
              <div className="h-3 w-12 rounded bg-secondary dark:bg-white/[0.06]" />
              <div className="h-2.5 w-24 rounded bg-secondary/70 dark:bg-white/[0.04]" />
            </div>
            <div className="p-2 space-y-2">
              {Array.from({ length: col % 2 === 0 ? 3 : 2 }).map((_, i) => (
                <div key={i} className="card p-2.5 space-y-1.5">
                  <div className="h-3.5 w-3/4 rounded bg-secondary dark:bg-white/[0.05]" />
                  <div className="h-2.5 w-1/2 rounded bg-secondary/70 dark:bg-white/[0.03]" />
                  <div className="h-2 w-2/3 rounded bg-secondary/60 dark:bg-white/[0.03]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
