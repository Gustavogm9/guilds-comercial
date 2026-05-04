/**
 * Loading skeleton padrão do app group.
 *
 * Next 14 monta este componente automaticamente em <Suspense> ao redor de cada
 * rota dentro de (app)/* enquanto o RSC do servidor está renderizando.
 *
 * O sidebar continua visível (vem do layout pai); só a área principal mostra
 * o skeleton — o que dá feedback imediato ao clicar em qualquer link.
 */
export default function AppLoading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-150">
      {/* Header skeleton */}
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 rounded-md bg-secondary dark:bg-white/[0.05] animate-pulse" />
        <div className="h-4 w-72 rounded-md bg-secondary/70 dark:bg-white/[0.03] animate-pulse" />
      </div>

      {/* KPI grid skeleton (4 cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="card p-4 flex items-center gap-3 animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="w-9 h-9 rounded-lg bg-secondary dark:bg-white/[0.05]" />
            <div className="flex-1 space-y-2">
              <div className="h-2.5 w-16 rounded bg-secondary dark:bg-white/[0.05]" />
              <div className="h-6 w-12 rounded bg-secondary/80 dark:bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>

      {/* Content rows skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="card p-4 flex items-center gap-3 animate-pulse"
            style={{ animationDelay: `${i * 40 + 200}ms` }}
          >
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-secondary dark:bg-white/[0.05]" />
              <div className="h-3 w-1/2 rounded bg-secondary/70 dark:bg-white/[0.03]" />
            </div>
            <div className="h-7 w-20 rounded-md bg-secondary dark:bg-white/[0.05]" />
          </div>
        ))}
      </div>
    </div>
  );
}
