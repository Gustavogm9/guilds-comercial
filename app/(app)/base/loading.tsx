/**
 * Loading skeleton da /base — tab strip + tabela.
 */
export default function BaseLoading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
          <div className="h-4 w-72 rounded-md bg-secondary/70 dark:bg-white/[0.03] animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-32 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
          <div className="h-8 w-24 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border dark:border-white/[0.06] mb-4">
        <div className="h-8 w-24 rounded-t bg-secondary dark:bg-white/[0.05] animate-pulse" />
        <div className="h-8 w-28 rounded-t bg-secondary/60 dark:bg-white/[0.03] animate-pulse" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="h-8 w-72 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
        <div className="h-8 w-40 rounded-md bg-secondary/80 dark:bg-white/[0.04] animate-pulse" />
        <div className="h-8 w-20 rounded-md bg-secondary/80 dark:bg-white/[0.04] animate-pulse" />
      </div>

      {/* Table */}
      <div className="card overflow-hidden animate-pulse">
        <div className="bg-secondary/60 dark:bg-white/[0.03] h-9 border-b border-border" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-3 border-b border-border/60 dark:border-white/[0.04]"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div className="h-3 w-32 rounded bg-secondary dark:bg-white/[0.05]" />
            <div className="h-3 w-28 rounded bg-secondary/70 dark:bg-white/[0.03]" />
            <div className="h-3 w-24 rounded bg-secondary/70 dark:bg-white/[0.03]" />
            <div className="h-3 w-20 rounded bg-secondary/70 dark:bg-white/[0.03]" />
            <div className="ml-auto h-7 w-24 rounded bg-secondary dark:bg-white/[0.05]" />
          </div>
        ))}
      </div>
    </div>
  );
}
