export default function ModelLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="h-4 w-40 bg-slate-800/50 rounded mb-6" />

      {/* Header skeleton */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-slate-700/50" />
        <div>
          <div className="h-7 w-36 bg-slate-700/50 rounded mb-2" />
          <div className="h-4 w-20 bg-slate-800/50 rounded" />
        </div>
      </div>

      {/* Gauge row skeleton */}
      <div className="grid sm:grid-cols-3 gap-6 mb-8">
        <div className="flex justify-center">
          <div className="w-40 h-40 rounded-full bg-slate-700/30 border-4 border-slate-700/50" />
        </div>
        <div className="rounded-xl bg-avi-card border border-avi-border p-5">
          <div className="h-3 w-20 bg-slate-700/50 rounded mb-4" />
          <div className="h-8 w-16 bg-slate-700/50 rounded mb-3" />
          <div className="h-6 w-24 bg-slate-800/50 rounded" />
        </div>
        <div className="rounded-xl bg-avi-card border border-avi-border p-5">
          <div className="h-3 w-16 bg-slate-700/50 rounded mb-4" />
          <div className="space-y-3">
            <div className="h-5 w-full bg-slate-800/30 rounded" />
            <div className="h-5 w-full bg-slate-800/30 rounded" />
            <div className="h-5 w-full bg-slate-800/30 rounded" />
          </div>
        </div>
      </div>

      {/* Chart skeleton */}
      <div className="rounded-xl bg-avi-card border border-avi-border p-6 mb-8">
        <div className="h-4 w-32 bg-slate-700/50 rounded mb-4" />
        <div className="h-72 bg-slate-800/30 rounded" />
      </div>
    </div>
  )
}
