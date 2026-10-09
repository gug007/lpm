import { MAIN_LOGIN } from "../claudePoolText";
import { projectPinned } from "../claudeProjectPool";
import { useAgentLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { useProjectClaudeAccounts } from "../hooks/useProjectClaudeAccounts";
import { isPeerName } from "../peer/markers";
import { accountMeters } from "../sidebarUsage";
import { useAppStore } from "../store/app";
import { openClaudeAccountSettings, setClaudeAccountChoice } from "../store/claudeAccountPin";
import { CheckIcon, SettingsIcon, StatsIcon, UserIcon } from "./icons";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

interface SidebarUsageAccountMenuProps {
  // The account's limits key; "default" is the main login.
  account: string;
  label: string;
  x: number;
  y: number;
  onOpenUsage: () => void;
  onClose: () => void;
}

/** Right-click on a Claude account's usage row: pin the selected project's
 *  new sessions to that account. */
export function SidebarUsageAccountMenu({ account, label, x, y, onOpenUsage, onClose }: SidebarUsageAccountMenuProps) {
  const selected = useAppStore((s) => s.selected);
  const projects = useAppStore((s) => s.projects);
  const { limits } = useAgentLimits();
  const now = useNow(true, 60_000);

  const project = projects.find((p) => p.name === selected && !p.isRemote && !isPeerName(p.name));
  const inUse = useProjectClaudeAccounts(project?.name ?? null);
  const where = project ? displayNameForProjectName(project.name, projects) : null;
  const usedHere = inUse?.current === account;
  const pinnedHere = usedHere && !!project && projectPinned(project, projects);
  const used = accountMeters(limits, account, now)
    .map((m) => `${m.label} ${m.percentText}`)
    .join(" · ");

  const then = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <ContextMenuShell x={x} y={y} onClose={onClose} minWidth={200}>
      <div className="flex flex-col gap-0.5 px-3 pb-1.5 pt-1">
        <span className="truncate text-[11px] font-medium text-[var(--text-primary)]">{label}</span>
        {used && <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{used} used</span>}
      </div>
      <ContextMenuSeparator />
      <ContextMenuItem
        label={`Switch to ${label}`}
        description={where ? `New sessions in ${where}` : "Select a local project first"}
        icon={<UserIcon />}
        trailing={<span className="flex w-3 justify-end">{usedHere && <CheckIcon />}</span>}
        disabled={!project || pinnedHere}
        onClick={then(() => {
          if (project)
            void setClaudeAccountChoice(project.name, { kind: "pin", id: account === MAIN_LOGIN ? "" : account });
        })}
      />
      <ContextMenuSeparator />
      <ContextMenuItem label="Open usage" icon={<StatsIcon />} onClick={then(onOpenUsage)} />
      <ContextMenuItem label="Claude accounts…" icon={<SettingsIcon />} onClick={then(openClaudeAccountSettings)} />
    </ContextMenuShell>
  );
}
