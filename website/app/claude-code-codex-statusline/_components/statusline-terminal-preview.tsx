export type StatuslineSegment = {
  id: string;
  text: string;
  className: string;
  active?: boolean;
};

export function StatuslineTerminalPreview({
  isClaude,
  segments,
  separator,
}: {
  isClaude: boolean;
  segments: StatuslineSegment[];
  separator: string;
}) {
  return (
    <div
      data-on-dark
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[#080808] transition-shadow duration-500 ${
        isClaude
          ? "shadow-[0_18px_48px_-28px_rgba(217,119,87,0.6)]"
          : "shadow-[0_18px_48px_-28px_rgba(16,163,127,0.6)]"
      }`}
    >
      <div className="flex h-9 items-center justify-between gap-3 border-b border-white/8 px-4">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="truncate font-mono text-[10px] tracking-wide text-zinc-600">
          ~/Projects/lpm
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
          Live
        </span>
      </div>
      <div className="p-4 font-mono text-xs sm:px-5">
        <p className="text-zinc-500">
          <span className="text-emerald-400">❯</span>{" "}
          {isClaude ? "claude" : "codex"}
        </p>
        <p className="mt-2 hidden text-zinc-300 sm:block">
          {isClaude
            ? "Ready to help with your project."
            : "What would you like to build?"}
        </p>
        <div
          className="mt-4 border-t border-white/8 pt-3"
          aria-live="polite"
          aria-label={`${isClaude ? "Claude Code" : "Codex"} statusline preview`}
        >
          {segments.length === 0 ? (
            <span className="text-zinc-600">Statusline hidden</span>
          ) : (
            <div className="flex flex-wrap items-center gap-y-1.5 leading-5">
              {segments.map((segment, index) => (
                <span key={segment.id} className="flex items-center">
                  {index > 0 && (
                    <span className="px-2 text-zinc-700">{separator}</span>
                  )}
                  <span
                    className={`rounded px-1 -mx-1 transition-colors duration-300 ${segment.className} ${
                      segment.active ? "bg-white/10" : ""
                    }`}
                  >
                    {segment.text}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
