"use client";

import { useCallback, useState } from "react";
import { ChevronRight, MoreVertical } from "lucide-react";
import type { AgentTabState } from "./project-view";
import type { AiStatus, DemoProject } from "./projects";
import { SidebarAgentRows, sidebarAgentRows } from "./sidebar-agent-rows";
import { SidebarRowMenu } from "./sidebar-row-menu";
import { FOCUS_RING, PRESS } from "./ui";

const ROW_BASE =
  "flex w-full select-none items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors";

const NAME_TONE: Record<AiStatus, string> = {
  running: "sidebar-shimmer",
  waiting: "sidebar-waiting",
  error: "text-[#f87171]",
  done: "text-[#60a5fa]",
};

const AI_LABEL: Record<AiStatus, string> = {
  running: "working",
  waiting: "needs you",
  error: "hit a problem",
  done: "done",
};

type ProjectRowProps = {
  project: DemoProject;
  selected: boolean;
  running: boolean;
  aiStatus?: AiStatus;
  agentTabs?: Record<string, AgentTabState>;
  expanded: boolean;
  onToggleAgents: () => void;
  onSelect: () => void;
};

export function SidebarProjectRow({
  project,
  selected,
  running,
  aiStatus,
  agentTabs,
  expanded,
  onToggleAgents,
  onSelect,
}: ProjectRowProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const label = project.label ?? project.name;
  const agents = sidebarAgentRows(agentTabs);
  const canExpand = agents.length > 0;
  const isExpanded = canExpand && expanded;

  // Room at the row's end for the controls parked there: the ⋮ once the row is
  // hovered or holding the menu, and the chevron whenever there are agents.
  const trailingPad = canExpand
    ? menu
      ? "pr-14"
      : "pr-8 group-hover:pr-14"
    : menu
      ? "pr-9"
      : "group-hover:pr-9";

  return (
    <>
      <div className="group relative">
        <button
          type="button"
          onClick={onSelect}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY });
          }}
          aria-current={selected ? "true" : undefined}
          aria-label={`${label}${running ? ", running" : ""}${
            aiStatus ? `, agent ${AI_LABEL[aiStatus]}` : ""
          }`}
          className={`${ROW_BASE} ${trailingPad} ${FOCUS_RING} ${
            menu ? "ring-1 ring-inset ring-[#22d3ee]/60" : ""
          } ${
            selected
              ? "bg-[#333333] text-[#e5e5e5]"
              : "text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              running ? "bg-[#4ade80]" : "border border-[#919191] bg-[#1a1a1a]"
            }`}
          />
          <span className={`truncate ${aiStatus ? NAME_TONE[aiStatus] : ""}`}>{label}</span>
          {aiStatus === "error" && (
            <span className="shrink-0 text-[11px] font-medium text-[#f87171]">Problem</span>
          )}
        </button>
        {canExpand && (
          <span
            className={`absolute top-1/2 -translate-y-1/2 transition-[right] ${
              menu ? "right-9" : "right-2 group-hover:right-9"
            }`}
          >
            <button
              type="button"
              onClick={onToggleAgents}
              title={isExpanded ? "Hide agents" : "Show agents"}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Hide" : "Show"} agents in ${label}`}
              className={`flex h-5 w-5 items-center justify-center rounded text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING}`}
            >
              {/* Turns rather than swaps, the way a folder's arrow does. */}
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform duration-150 ${
                  isExpanded ? "rotate-90" : ""
                }`}
                strokeWidth={1.5}
              />
            </button>
          </span>
        )}
        <button
          type="button"
          // Kept from this menu's own outside-click listener, so the second
          // click on ⋮ toggles it shut instead of closing and reopening it.
          // Only while it is ours: another row's menu still has to close.
          onPointerDown={(event) => {
            if (menu) event.stopPropagation();
          }}
          onClick={(event) => {
            if (menu) {
              closeMenu();
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
          title="More options"
          aria-label={`More options for ${label}`}
          className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[#919191] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${PRESS} ${FOCUS_RING} ${
            menu
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
          }`}
        >
          <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
      {isExpanded && <SidebarAgentRows agents={agents} onOpen={onSelect} />}
      {menu && <SidebarRowMenu x={menu.x} y={menu.y} label={label} onClose={closeMenu} />}
    </>
  );
}
