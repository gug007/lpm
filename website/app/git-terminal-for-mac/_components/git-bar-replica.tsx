import { Check, ChevronDown, GitBranch, GitPullRequest, Sparkles } from "lucide-react";

const FILES = [
  { status: "M", tone: "text-[#e2c08d]", path: "src/api/refunds.ts" },
  { status: "A", tone: "text-[#73c991]", path: "src/api/refunds.test.ts" },
  { status: "D", tone: "text-[#f48771]", path: "src/legacy/refund.js" },
];

export function GitBarReplica() {
  return (
    <div
      aria-hidden
      data-on-dark
      className="w-full overflow-hidden rounded-2xl border border-[#2e2e2e] bg-[#1b1b1b] shadow-xl shadow-gray-200/60 dark:shadow-black/40 select-none"
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-white">Commit</span>
          <span className="text-[#8f8f8f]">3 files</span>
        </div>
        <ul className="mt-3 space-y-1.5 font-mono text-[11.5px]">
          {FILES.map(({ status, tone, path }) => (
            <li key={path} className="flex min-w-0 items-center gap-2">
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-[#3b82f6]">
                <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[#c8c8c8]">{path}</span>
              <span className={`shrink-0 font-semibold ${tone}`}>{status}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-lg border border-[#333] bg-[#141414] p-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-[#9a9a9a]">
            <span>Message</span>
            <span className="inline-flex items-center gap-1 text-[#c8c8c8]">
              <Sparkles className="h-3 w-3" />
              Generate with AI
            </span>
          </div>
          <p className="mt-1.5 font-mono text-[12px] text-white">
            feat(api): support partial refunds
          </p>
        </div>
        <div className="mt-3 flex justify-end">
          <span className="inline-flex items-center overflow-hidden rounded-md bg-white text-[12px] font-medium text-[#111]">
            <span className="px-3 py-1.5">Commit and Push</span>
            <span className="border-l border-black/10 px-1.5 py-1.5">
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#2e2e2e] bg-[#161616] px-4 py-2.5 text-[11.5px] text-[#b3b3b3] sm:px-5">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">feature/refunds</span>
        </span>
        <span className="tabular-nums">2↓ 1↑</span>
        <span className="inline-flex items-center gap-1.5">
          Commit
          <span className="rounded bg-[#2e2e2e] px-1.5 tabular-nums">3</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#73c991]/15 px-2 py-0.5 text-[#73c991]">
          <GitPullRequest className="h-3 w-3" />
          PR #128
        </span>
      </div>
    </div>
  );
}
