import {
  ChevronDown,
  Columns2,
  GitBranch,
  GitCommitVertical,
  Lightbulb,
  Maximize2,
  Plus,
  Rows2,
  Terminal,
} from "lucide-react";
import { ShowcaseSession } from "./showcase-session";

/** Header actions; the ones that are not primary drop off narrow layouts. */
const ACTIONS = [
  { label: "Claude", glyph: "✻", primary: true },
  { label: "Codex", glyph: "◆", primary: true },
  { label: "dev" },
  { label: "test" },
  { label: "Website" },
];

const TABS = [
  { label: "web" },
  { label: "api" },
  { label: "claude", glyph: "✻", active: true },
];

export function ShowcaseWorkspace() {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <span className="min-w-0 shrink-0 truncate pr-1 text-base font-semibold tracking-tight text-[#e5e5e5] sm:text-xl">
          checkout
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
          <div className="hidden min-w-0 items-center gap-1.5 overflow-hidden sm:flex">
            {ACTIONS.map(({ label, glyph, primary }) => (
              <span
                key={label}
                className={`${
                  primary ? "inline-flex" : "hidden lg:inline-flex"
                } h-[30px] shrink-0 items-center gap-1.5 rounded-lg border border-[#2e2e2e] bg-[#242424] px-2.5 text-xs font-medium text-[#b3b3b3]`}
              >
                {glyph && <span className="text-[11px]">{glyph}</span>}
                {label}
              </span>
            ))}
          </div>
          <span className="hidden h-[30px] shrink-0 items-center gap-1 rounded-lg border border-dashed border-[#3a3a3a] px-2 text-xs font-medium text-[#919191] md:inline-flex">
            <Plus className="h-3.5 w-3.5" />
            Action
          </span>
          <span className="flex shrink-0">
            <span className="rounded-l-lg bg-[#e5e5e5] px-3 py-1.5 text-xs font-medium text-[#1a1a1a]">
              Start
            </span>
            <span className="rounded-r-lg border-l border-[#1a1a1a]/20 bg-[#e5e5e5] px-1.5 py-1.5 text-[#1a1a1a]">
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            </span>
          </span>
        </div>
      </div>

      <div className="relative flex shrink-0 items-center gap-0.5 overflow-hidden bg-[#2d2d2d] px-1.5 py-1">
        {TABS.map(({ label, glyph, active }) => (
          <span
            key={label}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 ${
              active ? "bg-white/[0.1] text-[#d4d4d4]" : "text-[#a0a0a0]"
            }`}
          >
            <span className="flex w-3.5 shrink-0 items-center justify-center">
              {glyph ? (
                <span className="text-[12px] leading-none">{glyph}</span>
              ) : (
                <Terminal className="h-3 w-3 text-[#8e8e8e]" />
              )}
            </span>
            <span className="truncate font-mono text-[11px] font-medium">
              {label}
            </span>
          </span>
        ))}
        <span className="ml-1 hidden shrink-0 items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[#a0a0a0] sm:flex">
          <Plus className="h-3 w-3" />
          <span className="h-3 w-px bg-white/15" />
          <ChevronDown className="h-2.5 w-2.5" />
        </span>
        <span className="ml-auto hidden shrink-0 items-center gap-2 pl-2 text-[#8e8e8e] sm:flex">
          <Columns2 className="h-3 w-3" />
          <Rows2 className="h-3 w-3" />
          <Maximize2 className="h-3 w-3" />
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#2d2d2d] sm:hidden" />
      </div>

      <ShowcaseSession />

      <div className="shrink-0 px-2 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-[#2e2e2e] bg-[#141414] px-3 py-2 font-mono text-[11px] text-[#8f8f8f]">
          <span className="text-fuchsia-300">&gt;</span>
          <span
            aria-hidden
            className="animate-caret-blink inline-block h-3.5 w-[7px] bg-[#d4d4d4]"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-[#2e2e2e] px-2 py-1 text-[11px] text-[#8f8f8f]">
        <span className="hidden min-w-0 items-center gap-1.5 truncate md:flex">
          <Lightbulb className="h-3 w-3 shrink-0" />
          Type @ to mention files, branches, changes, or terminals
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-md border border-[#2e2e2e] bg-[#242424] px-2 py-1 text-[10px] font-medium text-[#b3b3b3]">
          <GitBranch className="h-3 w-3" />
          main
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-md border border-[#2e2e2e] bg-[#242424] px-2 py-1 text-[10px] font-medium text-[#b3b3b3]">
          <GitCommitVertical className="h-3 w-3" />
          Commit
        </span>
      </div>
    </div>
  );
}
