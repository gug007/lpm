import { Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import { agentSettingsLine } from "../agentSettingsLine";
import { archiveAfterOf } from "../archiveAfter";
import { useNow } from "../hooks/useNow";
import { rowProps, type SettingsRowId } from "../settings-registry";
import type { SidebarAgentRow } from "../sidebarAgents";
import { DEFAULT_KEEP_FINISHED_AGENTS, DEFAULT_SEEN_SHOWN, SEEN_SHOWN_MAX, SEEN_SHOWN_MIN } from "../store/settings";
import { ArchiveAfterControl } from "./settings/ArchiveAfterControl";
import type { SettingsTarget } from "./settings/settingsTarget";
import { StepperControl } from "./settings/StepperControl";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { Toggle } from "./ui/Toggle";

/** The settings to show, or what stands in for them while a paired computer
 *  can't be asked. */
export type AgentSettingsState =
  | { status: "ready"; target: SettingsTarget }
  | { status: "waiting"; note: string; retry?: () => void };

interface SidebarAgentSettingsPanelProps {
  agent: SidebarAgentRow;
  anchor: HTMLElement;
  trigger: HTMLElement | null;
  /** The paired computer the settings live on; absent for this one. */
  machineName?: string;
  state: AgentSettingsState;
  onOpenAll: () => void;
  onClose: () => void;
}

const WIDTH = 304;

// A label wide enough to read before its control wraps below it.
function settingRow(id: SettingsRowId, control: ReactNode, nested = false) {
  const { label, description } = rowProps(id);
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${
        nested ? "ml-0.5 border-l-2 border-[var(--border)] pl-2.5" : ""
      }`}
    >
      <div className="min-w-[150px] flex-1">
        <div className="text-[12px] leading-snug text-[var(--text-primary)]">{label}</div>
        {description && (
          <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--text-muted)]">{description}</div>
        )}
      </div>
      <div className="ml-auto shrink-0">{control}</div>
    </div>
  );
}

/** Settings › Agents › In the sidebar, opened beside an agent row: what those
 *  settings mean for that row, and the settings themselves, changed in place. */
export function SidebarAgentSettingsPanel({
  agent,
  anchor,
  trigger,
  machineName,
  state,
  onOpenAll,
  onClose,
}: SidebarAgentSettingsPanelProps) {
  const now = useNow(agent.seenAt !== undefined);
  const target = state.status === "ready" ? state.target : null;
  const keep = target?.settings.keepFinishedAgents ?? DEFAULT_KEEP_FINISHED_AGENTS;
  const shown = target?.settings.seenAgentsShown ?? DEFAULT_SEEN_SHOWN;
  const after = target?.settings.autoArchiveAgentsAfter;

  return (
    <ContextMenuShell anchor={anchor} trigger={trigger} side="right" minWidth={WIDTH} onClose={onClose}>
      <div role="dialog" aria-label={`Agent settings for ${agent.title}`} style={{ width: WIDTH }}>
        <div className="border-b border-[var(--border)] px-3 pb-2 pt-1.5">
          <div className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">{agent.title}</div>
          {target && (
            <div data-agent-settings-line="" className="mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)]">
              {agentSettingsLine(agent, { keep, after: archiveAfterOf(after) }, now)}
            </div>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-3 px-3 pb-2 pt-2.5 text-[10.5px] text-[var(--text-muted)]">
          <span className="font-semibold uppercase tracking-wide">Agent settings</span>
          <span className="truncate">{machineName ? `On ${machineName}` : "All projects"}</span>
        </div>
        {target ? (
          <div className="flex flex-col gap-3 px-3 pb-3">
            {settingRow(
              "general.keepFinishedAgents",
              <Toggle
                aria-label="Keep finished agents until archived"
                enabled={keep}
                onChange={(v) => void target.update({ keepFinishedAgents: v })}
              />,
            )}
            {keep &&
              settingRow(
                "general.autoArchiveAgents",
                <ArchiveAfterControl
                  value={after}
                  onChange={(value) => void target.update({ autoArchiveAgentsAfter: value })}
                />,
                true,
              )}
            {keep &&
              settingRow(
                "general.seenAgentsShown",
                <StepperControl
                  value={String(shown)}
                  label="seen agents per project"
                  canDecrease={shown > SEEN_SHOWN_MIN}
                  canIncrease={shown < SEEN_SHOWN_MAX}
                  onDecrease={() => void target.update({ seenAgentsShown: shown - 1 })}
                  onIncrease={() => void target.update({ seenAgentsShown: shown + 1 })}
                />,
                true,
              )}
          </div>
        ) : (
          <div className="px-3 pb-3 text-[11.5px] leading-snug text-[var(--text-muted)]">
            {state.status === "waiting" && state.note}
            {state.status === "waiting" && state.retry && (
              <button
                type="button"
                onClick={state.retry}
                className="ml-1 font-medium text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
              >
                Try again
              </button>
            )}
          </div>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          label="All agent settings…"
          icon={<Settings2 size={12} />}
          onClick={() => {
            onClose();
            onOpenAll();
          }}
        />
      </div>
    </ContextMenuShell>
  );
}
