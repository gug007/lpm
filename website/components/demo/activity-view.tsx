"use client";

import { useState } from "react";
import { Clock, Layers, Server, Terminal } from "lucide-react";
import {
  ACTIVITY_STATE_LABEL,
  ACTIVITY_STATE_STYLE,
  activityRows,
  type ActivityInput,
  type ActivityKind,
  type ActivityRow,
} from "./activity";

const KINDS: { value: ActivityKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "agent", label: "Agents" },
  { value: "service", label: "Services" },
  { value: "automation", label: "Automations" },
];

type ActivityViewProps = ActivityInput & {
  onOpenProject: (name: string) => void;
  onOpenAutomations: () => void;
};

export function ActivityView({
  onOpenProject,
  onOpenAutomations,
  ...input
}: ActivityViewProps) {
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const rows = activityRows(input);
  const shown = kind === "all" ? rows : rows.filter((row) => row.kind === kind);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="text-[#919191]">
          <Layers className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight text-[#e5e5e5]">Activity</div>
          <div className="text-[10px] text-[#919191]">
            Your agents, services and automations, with anything waiting on you first
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-[#2e2e2e] px-3 py-2 sm:px-4">
        {KINDS.map((option) => {
          const count =
            option.value === "all"
              ? rows.length
              : rows.filter((row) => row.kind === option.value).length;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              aria-pressed={kind === option.value}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                kind === option.value
                  ? "bg-[#333333] text-[#e5e5e5]"
                  : "text-[#919191] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
              }`}
            >
              {option.label}
              <span className="tabular-nums text-[#6b6b6b]">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
        {shown.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="text-[13px] font-medium text-[#e5e5e5]">Nothing running here yet</div>
            <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-[#919191]">
              Start a project&apos;s services or launch an agent and it shows up here — across every
              project, without hunting through tabs.
            </p>
          </div>
        ) : (
          shown.map((row) => (
            <ActivityRowItem
              key={row.id}
              row={row}
              onOpen={() =>
                row.kind === "automation" ? onOpenAutomations() : onOpenProject(row.project)
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: ActivityKind }) {
  if (kind === "automation") return <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />;
  if (kind === "service") return <Server className="h-3.5 w-3.5" strokeWidth={1.75} />;
  return <Terminal className="h-3.5 w-3.5" strokeWidth={1.75} />;
}

function ActivityRowItem({ row, onOpen }: { row: ActivityRow; onOpen: () => void }) {
  const style = ACTIVITY_STATE_STYLE[row.state];
  const working = row.state === "working";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#222222] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#2a2a2a] text-[#919191]">
        <KindIcon kind={row.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-[#e5e5e5]">
            {row.projectLabel}
          </span>
          <span className="min-w-0 truncate text-[11px] text-[#919191]">{row.title}</span>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-[#919191]">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot} ${
              working ? "animate-pulse" : ""
            }`}
          />
          <span className={`shrink-0 ${style.text}`}>{ACTIVITY_STATE_LABEL[row.state]}</span>
          <span className="min-w-0 truncate">· {row.detail}</span>
        </span>
      </span>
    </button>
  );
}
