export function PrecheckReplica() {
  return (
    <div
      aria-hidden="true"
      data-on-dark
      className="h-full rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] p-4 text-left sm:p-5"
    >
      <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#919191]">
        Only when there&apos;s work (optional)
      </div>
      <div className="space-y-2 rounded-xl bg-[#242424]/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[#e5e5e5]">
            git fetch &amp;&amp; git log HEAD..@{"{u}"} --oneline | grep .
          </span>
          <span className="shrink-0 rounded-md border border-[#3a3a3a] px-2.5 py-1 text-[12px] font-medium text-[#b3b3b3]">
            Test
          </span>
        </div>
        <p className="text-[12px] text-[#22d3ee]">Would run — there&apos;s work to do.</p>
        <pre className="overflow-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-[#919191]">
          {"3f9c2a1 Add rate limit to /v1/search\n8b1e07d Move order totals to numeric"}
        </pre>
      </div>
      <p className="mt-2 px-1 text-[12px] leading-snug text-[#919191]">
        A command that decides whether the job has anything to do — it runs only
        when this succeeds. Leave blank to run every time.
      </p>
    </div>
  );
}
