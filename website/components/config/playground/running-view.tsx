import { Terminal } from "lucide-react";
import type { Pane } from "./types";

const ALL_TAB = "all";

export function RunningView({
  panes,
  visiblePanes,
  activeTab,
  projectName,
  onTabChange,
  onCloseTerminal,
}: {
  panes: Pane[];
  visiblePanes: Pane[];
  activeTab: string;
  projectName: string;
  onTabChange: (tabId: string) => void;
  onCloseTerminal: (key: string) => void;
}) {
  const showAllTab = panes.length > 1;
  const tabIds: string[] = showAllTab
    ? [ALL_TAB, ...panes.map((p) => p.id)]
    : panes.map((p) => p.id);
  return (
    <div className="mt-3 flex flex-1 min-h-0 flex-col rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-[#1a1a1a]">
      {panes.length > 1 && (
        <TabBar
          tabIds={tabIds}
          activeTab={activeTab}
          panes={panes}
          onTabChange={onTabChange}
        />
      )}
      <div className="flex flex-1 min-h-0 flex-row">
        {visiblePanes.map((p, i) => (
          <PaneColumn
            key={p.id}
            pane={p}
            projectName={projectName}
            showDivider={i > 0}
            onClose={() => onCloseTerminal(p.key)}
          />
        ))}
      </div>
    </div>
  );
}

function TabBar({
  tabIds,
  activeTab,
  panes,
  onTabChange,
}: {
  tabIds: string[];
  activeTab: string;
  panes: Pane[];
  onTabChange: (tabId: string) => void;
}) {
  const labelFor = (tabId: string) =>
    tabId === ALL_TAB
      ? ALL_TAB
      : (panes.find((p) => p.id === tabId)?.label ?? tabId);
  return (
    <div className="flex-shrink-0 flex items-center gap-0.5 border-b border-white/5 bg-gray-900/60 px-1.5 py-1 overflow-x-auto">
      {tabIds.map((tabId) => {
        const active = tabId === activeTab;
        return (
          <button
            key={tabId}
            type="button"
            onClick={() => onTabChange(tabId)}
            className={`flex items-center rounded-md px-2.5 py-1 font-mono text-[11px] font-medium whitespace-nowrap transition-colors ${
              active
                ? "bg-white/10 text-gray-100"
                : "text-gray-400 hover:text-gray-100"
            }`}
          >
            {labelFor(tabId)}
          </button>
        );
      })}
    </div>
  );
}

function PaneColumn({
  pane,
  projectName,
  showDivider,
  onClose,
}: {
  pane: Pane;
  projectName: string;
  showDivider: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`flex-1 min-w-0 flex flex-col ${
        showDivider ? "border-l border-[#2d2d2d]" : ""
      }`}
    >
      <PaneHeader pane={pane} onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-100">
        <div className="text-emerald-400 break-all">
          $ {pane.cmd || "(no cmd)"}
        </div>
        {pane.type === "service" && (
          <div className="text-gray-400 break-all">
            [{projectName}] started {pane.key}
          </div>
        )}
        <div className="flex items-center text-gray-100">
          <span className="text-gray-500 mr-1">&gt;</span>
          <span className="inline-block w-[7px] h-3.5 bg-gray-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function PaneHeader({
  pane,
  onClose,
}: {
  pane: Pane;
  onClose: () => void;
}) {
  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 bg-[#2d2d2d] px-2 py-1">
      {pane.type === "service" ? (
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
      ) : (
        <Terminal className="w-3 h-3 text-[#8e8e8e] shrink-0" />
      )}
      <span className="font-mono text-[11px] font-medium text-[#8e8e8e] truncate flex-1">
        {pane.label}
      </span>
      {pane.type === "terminal" && (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${pane.label}`}
          className="rounded px-1 text-[#8e8e8e] hover:bg-white/[0.06] hover:text-gray-100 transition-colors flex-shrink-0 leading-none text-sm"
        >
          ×
        </button>
      )}
    </div>
  );
}
