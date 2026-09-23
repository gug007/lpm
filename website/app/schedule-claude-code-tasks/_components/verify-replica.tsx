const RUNS = [
  { label: "Done — checks passed", stats: "6m 12s · $0.84", when: "7h ago" },
  { label: "Done — checks failed", stats: "9m 40s · $1.12", when: "1d ago" },
];

export function VerifyReplica() {
  return (
    <div
      aria-hidden="true"
      data-on-dark
      className="h-full rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] p-4 text-left sm:p-5"
    >
      <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#919191]">
        Check the work afterwards (optional)
      </div>
      <div className="rounded-xl bg-[#242424]/60 px-4 py-3 font-mono text-[12.5px] text-[#e5e5e5]">
        npm test
      </div>
      <div className="mt-3 border-t border-[#2e2e2e] pt-2">
        {RUNS.map((run) => (
          <div key={run.label} className="flex items-center gap-3 px-1 py-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#22d3ee]" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#e5e5e5]">
              {run.label}
            </span>
            <span className="hidden shrink-0 text-[11px] tabular-nums text-[#919191] min-[400px]:inline">
              {run.stats}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-[#919191]">{run.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
