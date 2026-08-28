"use client";

import { useState } from "react";
import { Terminal } from "lucide-react";
import { InteractiveTerminal } from "./project-view";
import { PaneHeader, type TabInfo } from "./terminal-pane";
import { FOCUS_RING, PRESS } from "./ui";

type Split = "none" | "right" | "down";

const FIRST_TAB: TabInfo = {
  key: "shell",
  label: "shell",
  type: "terminal",
  running: false,
};

export function GlobalTerminalsView() {
  const [tabs, setTabs] = useState<TabInfo[]>([FIRST_TAB]);
  const [active, setActive] = useState(0);
  const [split, setSplit] = useState<Split>("none");
  const [created, setCreated] = useState(1);
  const [clears, setClears] = useState<Record<string, number>>({});

  const addTerminal = () => {
    const next = created + 1;
    setCreated(next);
    setTabs((prev) => [
      ...prev,
      { key: `shell-${next}`, label: `shell ${next}`, type: "terminal", running: false },
    ]);
    setActive(tabs.length);
  };

  const closeTab = (idx: number) => {
    setTabs((prev) => prev.filter((_, i) => i !== idx));
    setActive((prev) => (idx <= prev ? Math.max(0, prev - 1) : prev));
    if (tabs.length === 1) setSplit("none");
  };

  const toggleSplit = (next: Split) => setSplit((prev) => (prev === next ? "none" : next));

  // The shell owns its scrollback, so clearing it means starting a fresh one.
  const clearActive = () => {
    const key = tabs[active]?.key;
    if (!key) return;
    setClears((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="text-[#919191]">
          <Terminal className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight text-[#e5e5e5]">Terminals</div>
          <div className="text-[11px] text-[#919191]">
            Quick shells for scripts and system commands — not tied to a project
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[#2e2e2e]">
        {tabs.length === 0 ? (
          <EmptyTerminals onNewTerminal={addTerminal} />
        ) : (
          <>
            <PaneHeader
              tabs={tabs}
              activeIdx={active}
              onSelectTab={setActive}
              onCloseTab={closeTab}
              onNewTab={addTerminal}
              onOpenPort={() => {}}
              onClear={clearActive}
              onSplitRight={() => toggleSplit("right")}
              onSplitDown={() => toggleSplit("down")}
            />
            <div
              className={`flex min-h-0 flex-1 ${split === "down" ? "flex-col" : "flex-row"}`}
            >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {tabs.map((tab, i) => (
                  <div
                    key={tab.key}
                    className={i === active ? "flex min-h-0 flex-1 flex-col" : "hidden"}
                  >
                    <InteractiveTerminal
                      key={clears[tab.key] ?? 0}
                      projectRoot="~"
                    />
                  </div>
                ))}
              </div>
              {split !== "none" && (
                <>
                  <div
                    className={`shrink-0 bg-[#2e2e2e] ${
                      split === "right" ? "w-px" : "h-px"
                    }`}
                  />
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <InteractiveTerminal key={split} projectRoot="~" />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyTerminals({ onNewTerminal }: { onNewTerminal: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[#2e2e2e] bg-[#2a2a2a] text-[#919191]">
          <Terminal className="h-[26px] w-[26px]" strokeWidth={1.5} />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <h3 className="text-sm font-medium text-[#e5e5e5]">No terminals yet</h3>
          <p className="text-xs leading-relaxed text-[#919191]">
            Quick shells for scripts, system commands, and anything that isn&apos;t tied to a
            single project.
          </p>
        </div>
        <button
          type="button"
          onClick={onNewTerminal}
          className={`flex items-center gap-2 rounded-lg bg-[#e5e5e5] px-4 py-2 text-xs font-medium text-[#1a1a1a] hover:opacity-85 ${FOCUS_RING} ${PRESS}`}
        >
          <Terminal className="h-3.5 w-3.5" strokeWidth={2} />
          New Terminal
          <kbd className="ml-1 text-[10px] opacity-70">⌘T</kbd>
        </button>
      </div>
    </div>
  );
}
