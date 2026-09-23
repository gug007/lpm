import { Terminal } from "lucide-react";

export type StatuslineSegment = {
  id: string;
  text: string;
  className: string;
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
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
          Live terminal preview
        </h3>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/8 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Applied
        </span>
      </div>
      <div
        data-on-dark
        className={`overflow-hidden rounded-2xl border border-white/10 bg-[#080808] transition-shadow duration-500 ${
          isClaude
            ? "shadow-[0_24px_60px_-28px_rgba(217,119,87,0.55)]"
            : "shadow-[0_24px_60px_-28px_rgba(16,163,127,0.55)]"
        }`}
      >
        <div className="flex h-10 items-center justify-between border-b border-white/8 px-4">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-[10px] tracking-wide text-zinc-600">
            ~/Projects/lpm
          </span>
          <Terminal className="h-3.5 w-3.5 text-zinc-700" aria-hidden />
        </div>
        <div className="flex min-h-52 flex-col justify-between p-4 font-mono text-xs sm:min-h-60 sm:p-5">
          <div className="space-y-2 text-zinc-500">
            <p>
              <span className="text-emerald-400">❯</span>{" "}
              {isClaude ? "claude" : "codex"}
            </p>
            <p className="text-zinc-300">
              {isClaude
                ? "Ready to help with your project."
                : "What would you like to build?"}
            </p>
            <p className="pt-4 text-zinc-700">
              <span className="motion-safe:animate-pulse">▋</span>
            </p>
          </div>
          <div
            className="relative mt-8 border-t border-white/8 pt-3"
            aria-live="polite"
            aria-label={`${isClaude ? "Claude Code" : "Codex"} statusline preview`}
          >
            {segments.length === 0 ? (
              <span className="text-zinc-600">Statusline hidden</span>
            ) : (
              <div className="relative">
                <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex min-w-max items-center whitespace-nowrap pr-10">
                    {segments.map((segment, index) => (
                      <span key={segment.id} className="flex items-center">
                        {index > 0 && (
                          <span className="px-2 text-zinc-700">{separator}</span>
                        )}
                        <span className={segment.className}>{segment.text}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#080808] to-transparent"
                  aria-hidden
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
