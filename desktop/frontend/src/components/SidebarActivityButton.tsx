import { useAgentOverviewShortcut } from "../hooks/useAgentOverviewShortcut";
import { LayersIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";

interface SidebarActivityButtonProps {
  active: boolean;
  needsYou: number;
  hasError: boolean;
  onToggle: () => void;
}

export function SidebarActivityButton({
  active,
  needsYou,
  hasError,
  onToggle,
}: SidebarActivityButtonProps) {
  const shortcut = useAgentOverviewShortcut(onToggle);

  return (
    <Tooltip
      content="Every agent and automation across your projects, ordered by what is waiting on you."
      side="right"
      wide
      delay={500}
      triggerClassName="flex w-full"
    >
      <button
        onClick={onToggle}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          active
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <LayersIcon />
        Activity
        <span className="ml-auto flex items-center gap-2">
          {shortcut && (
            <kbd className="shrink-0 text-[10px] opacity-50">
              {shortcut}
            </kbd>
          )}
          {(needsYou > 0 || hasError) && (
            <span className="flex items-center gap-1.5">
              {needsYou > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-medium tabular-nums text-[var(--accent-amber)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />
                  {needsYou}
                </span>
              )}
              {hasError && (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-red)]" />
              )}
            </span>
          )}
        </span>
      </button>
    </Tooltip>
  );
}
