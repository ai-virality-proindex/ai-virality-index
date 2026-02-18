export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-8 w-48 bg-slate-700/50 rounded mb-2" />
          <div className="h-4 w-64 bg-slate-800/50 rounded" />
        </div>
        <div className="h-10 w-32 bg-slate-700/50 rounded-lg" />
      </div>

      {/* Model cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-avi-card border border-avi-border p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-700/50" />
              <div>
                <div className="h-4 w-24 bg-slate-700/50 rounded mb-1" />
                <div className="h-3 w-16 bg-slate-800/50 rounded" />
              </div>
            </div>
            <div className="h-8 w-16 bg-slate-700/50 rounded mb-2" />
            <div className="h-3 w-20 bg-slate-800/50 rounded" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="rounded-xl bg-avi-card border border-avi-border p-6">
        <div className="h-4 w-32 bg-slate-700/50 rounded mb-4" />
        <div className="h-64 bg-slate-800/30 rounded" />
      </div>
    </div>
  )
}
