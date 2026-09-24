import { useMemo } from "react";
import { AlarmClock } from "lucide-react";
import { useNow } from "../hooks/useNow";
import { useAppStore } from "../store/app";
import { useSendLater, type ScheduledPrompt } from "../store/sendLater";
import type { HistoryScope } from "../store/messageHistory";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import { ScheduledPromptRow } from "./ScheduledPromptRow";
import { Kbd } from "./ui/Kbd";

interface ScheduledPromptListProps {
  scope: HistoryScope;
  projectName: string;
  search: string;
  fromHistoryKey: string;
  onLeave: () => void;
}

// History › Scheduled: every prompt waiting to be sent, grouped by where it
// will go, soonest first.
export function ScheduledPromptList({ scope, projectName, search, fromHistoryKey, onLeave }: ScheduledPromptListProps) {
  const items = useSendLater((s) => s.items);
  const holds = useSendLater((s) => s.holds);
  const projects = useAppStore((s) => s.projects);
  const now = useNow(items.length > 0, 30_000);

  const groups = useMemo(() => {
    const needle = search.toLowerCase();
    const shown = items.filter(
      (i) =>
        (scope === "all" || i.projectName === projectName) &&
        (!needle || i.text.toLowerCase().includes(needle) || i.terminalLabel.toLowerCase().includes(needle)),
    );
    const byTerminal = new Map<string, ScheduledPrompt[]>();
    for (const item of shown) {
      const key = `${item.projectName}\u0000${item.historyKey}`;
      byTerminal.set(key, [...(byTerminal.get(key) ?? []), item]);
    }
    return [...byTerminal.values()];
  }, [items, scope, projectName, search]);

  const projectLabel = (name: string) =>
    name === GLOBAL_TERMINALS_KEY ? "Terminals" : (projects.find((p) => p.name === name)?.label ?? name);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <span className="text-[var(--text-muted)]">
          <AlarmClock size={18} strokeWidth={1.5} />
        </span>
        <span className="text-[13px] font-medium text-[var(--text-secondary)]">
          {search ? "No matching scheduled prompts" : "Nothing scheduled"}
        </span>
        {!search && (
          <span className="max-w-[340px] text-[12px] leading-relaxed text-[var(--text-muted)]">
            Write a prompt and press <Kbd>⌥↵</Kbd> to send it later: at a time, after a delay, or when the
            agent's usage limit resets.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <div key={`${group[0].projectName}:${group[0].historyKey}`} className="flex flex-col">
          <div className="px-2.5 pb-0.5 pt-1 text-[10.5px] font-medium text-[var(--text-muted)]">
            {projectLabel(group[0].projectName)} · {group[0].terminalLabel || "Terminal"}
          </div>
          {group.map((item) => (
            <ScheduledPromptRow
              key={item.id}
              item={item}
              hold={holds[item.id]}
              now={now}
              fromHistoryKey={fromHistoryKey}
              onLeave={onLeave}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
