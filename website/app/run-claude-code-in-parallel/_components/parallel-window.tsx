import VisualComposer from "./visual-composer";
import VisualPane from "./visual-pane";
import VisualSidebar from "./visual-sidebar";
import { CLAUDE_LINES, CODEX_LINES } from "./visual-data";

const CLAUDE_GLYPH = "text-[#d97757]";
const CODEX_GLYPH = "text-[#67e8f9]";

export default function ParallelWindow() {
  return (
    <div
      data-on-dark
      aria-hidden="true"
      className="overflow-hidden rounded-xl bg-[#111113] p-1.5 shadow-2xl shadow-gray-300/60 ring-1 ring-black/15 dark:shadow-black/60 dark:ring-[#3a3a3c]"
    >
      <div className="overflow-hidden rounded-lg bg-[#1a1a1a]">
        <div className="relative flex h-8 shrink-0 items-center border-b border-[#2d2d2d] px-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-gray-400">
            lpm
          </span>
        </div>

        <div className="flex h-[22rem] sm:h-[23.5rem]">
          <VisualSidebar />

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[#2d2d2d] px-3">
              <span className="truncate text-[10px] font-semibold text-gray-100 sm:text-[12px]">
                shop-api
              </span>
              <span className="hidden rounded border border-[#333] px-1.5 py-px font-mono text-[9px] text-gray-400 sm:inline">
                main
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-md border border-[#333] bg-[#222] px-1.5 py-0.5 text-[8.5px] text-gray-200 sm:text-[10px]">
                  <span className={CLAUDE_GLYPH}>✻</span>
                  Claude
                </span>
                <span className="flex items-center gap-1 rounded-md border border-[#333] bg-[#222] px-1.5 py-0.5 text-[8.5px] text-gray-200 sm:text-[10px]">
                  <span className={CODEX_GLYPH}>◆</span>
                  Codex
                </span>
              </span>
            </div>

            <div className="flex min-h-0 flex-1">
              <VisualPane
                className="flex-1"
                lines={CLAUDE_LINES}
                tabs={[
                  {
                    glyph: "✻",
                    glyphClass: CLAUDE_GLYPH,
                    title: "Rate-limit the login route",
                    state: "working",
                    active: true,
                  },
                  {
                    glyph: "◆",
                    glyphClass: CODEX_GLYPH,
                    title: "Tests for auth middleware",
                    state: "needs-you",
                    display: "flex md:hidden",
                  },
                  {
                    glyph: "●",
                    glyphClass: "text-[7px] text-emerald-400",
                    title: "api",
                    display: "hidden md:flex",
                  },
                ]}
              >
                <VisualComposer />
              </VisualPane>
              <div className="hidden min-w-0 flex-1 md:flex">
                <VisualPane
                  className="flex-1 border-l border-[#2d2d2d]"
                  lines={CODEX_LINES}
                  tabs={[
                    {
                      glyph: "◆",
                      glyphClass: CODEX_GLYPH,
                      title: "Tests for auth middleware",
                      state: "needs-you",
                      active: true,
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
