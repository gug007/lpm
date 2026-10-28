import {
  ChevronUp,
  Clipboard,
  FileCode2,
  Folder,
  GitBranch,
  Lightbulb,
  Mic,
  Plus,
  ScrollText,
  SendHorizontal,
  Sparkles,
} from "lucide-react";

const MENTIONS = [
  { icon: FileCode2, label: "src/cart/cart.test.ts", hint: "File" },
  { icon: FileCode2, label: "src/cart/cart.ts", hint: "File" },
  { icon: Folder, label: "src/cart/", hint: "Folder" },
  { icon: GitBranch, label: "fix/cart-total", hint: "Branch" },
  { icon: ScrollText, label: "cart-worker", hint: "Service logs" },
];

export default function ComposerReplica() {
  return (
    <div
      data-on-dark
      aria-hidden="true"
      className="overflow-hidden rounded-xl bg-[#111113] p-1.5 shadow-2xl shadow-gray-300/60 ring-1 ring-black/15 dark:shadow-black/60 dark:ring-[#3a3a3c]"
    >
      <div className="flex h-[21rem] flex-col overflow-hidden rounded-lg bg-[#1a1a1a]">
        <div className="flex h-8 items-end gap-0.5 border-b border-[#2d2d2d] bg-[#161616] px-1.5">
          <span className="flex items-center gap-1.5 rounded-t-md bg-[#1f1f1f] px-2.5 py-1 text-[11px] text-gray-100 ring-1 ring-inset ring-[#2d2d2d]">
            <span className="text-[#d97757]">✻</span>
            Fix the flaky cart test
          </span>
        </div>

        <div className="space-y-1 px-3.5 pb-2 pt-3 font-mono text-[10.5px] leading-[1.35rem] text-gray-400">
          <p>
            <span className="text-[#4eba65]">⏺ </span>
            <span className="font-semibold text-gray-100">Read</span>
            <span className="text-gray-300">(src/cart/cart.test.ts)</span>
          </p>
          <p className="text-gray-500">{"  ⎿  Read 86 lines"}</p>
        </div>

        <div className="relative mx-2 mt-auto">
          <div className="absolute bottom-[calc(100%+0.375rem)] left-2 z-10 w-[min(17rem,calc(100%-2rem))] rounded-lg border border-[#333] bg-[#232323] py-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)]">
            {MENTIONS.map(({ icon: Icon, label, hint }, index) => (
              <div
                key={label}
                className={`mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${
                  index === 0 ? "bg-white/[0.08] text-gray-100" : "text-gray-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="shrink-0 text-[10px] text-gray-500">{hint}</span>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-[#333] bg-[#222] px-3 pb-2 pt-2.5">
            <p className="text-[12px] leading-relaxed text-gray-200">
              The cart total test fails about one run in five. Find out why in{" "}
              <span className="text-[#60a5fa]">@cart</span>
              <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-gray-200" />
            </p>
            <div className="mt-2.5 flex items-center gap-3 text-gray-500">
              <Mic className="h-3.5 w-3.5" strokeWidth={2} />
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              <Clipboard className="h-3.5 w-3.5" strokeWidth={2} />
              <span className="ml-auto flex items-center overflow-hidden rounded-md bg-[#2f6fde] text-white">
                <span className="flex h-6 w-7 items-center justify-center">
                  <SendHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
                <span className="h-3.5 w-px bg-white/25" />
                <span className="flex h-6 w-5 items-center justify-center">
                  <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
                </span>
              </span>
            </div>
          </div>
        </div>
        <p className="mx-2 mb-2 mt-2 flex items-center gap-1.5 px-1 text-[10.5px] text-gray-500">
          <Lightbulb className="h-3 w-3 text-[#fbbf24]" strokeWidth={2} />
          Type
          <kbd className="rounded border border-[#3a3a3a] px-1 font-sans text-[10px] text-gray-400">
            @
          </kbd>
          to mention files, branches, changes, or terminals
        </p>
      </div>
    </div>
  );
}
