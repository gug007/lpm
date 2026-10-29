import { X } from "lucide-react";
import { askClaudeInNewTab } from "../../agentTabPrompt";
import { toast } from "../../notifications/toast";
import { useServiceLogs } from "../../store/serviceLogs";
import { paneSessionText } from "../Pane";
import { AgentGlyph } from "./AgentGlyph";
import { LogFilterChip } from "./LogFilterChip";
import type { LogSeverity } from "./logSeverity";
import { serviceErrorPrompt } from "./serviceErrorPrompt";

interface ServiceLogFilterBarProps {
  projectName: string;
  service: string;
  cmd?: string;
  sessionKey: string;
}

/** Above a service's output while it shows only errors or warnings: switch
 *  between them, go back to everything, or hand the errors to Claude. */
export function ServiceLogFilterBar({ projectName, service, cmd, sessionKey }: ServiceLogFilterBarProps) {
  const severity = useServiceLogs((s) => s.filter[sessionKey]);
  const counts = useServiceLogs((s) => s.counts[sessionKey]);
  const setFilter = useServiceLogs((s) => s.setFilter);
  if (!severity) return null;
  const show = (next: LogSeverity | null) => setFilter(sessionKey, next);

  const askClaude = () => {
    askClaudeInNewTab(projectName, serviceErrorPrompt(service, cmd, paneSessionText(sessionKey)));
    toast.success(`Started Claude in a new tab to look at ${service}'s errors`);
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--terminal-header-hover)] bg-[var(--terminal-header)] px-3 py-1">
      <LogFilterChip label="Errors" count={counts?.errors ?? 0} on={severity === "error"} onClick={() => show("error")} />
      <LogFilterChip label="Warnings" count={counts?.warnings ?? 0} on={severity === "warning"} onClick={() => show("warning")} />
      <LogFilterChip label="All output" on={false} onClick={() => show(null)} />
      <span className="flex-1" />
      {severity === "error" && (counts?.errors ?? 0) > 0 && (
        <button
          type="button"
          onClick={askClaude}
          className="flex h-5 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--terminal-header-hover)] hover:text-[var(--text-primary)]"
        >
          <AgentGlyph agent="claude" size={12} />
          Ask Claude
        </button>
      )}
      <button
        type="button"
        aria-label="Show all output"
        onClick={() => show(null)}
        className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--terminal-header-hover)] hover:text-[var(--text-primary)]"
      >
        <X size={12} />
      </button>
    </div>
  );
}
