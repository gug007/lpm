import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { GetServiceLogs, WatchLogs, StopWatchLogs } from "../../wailsjs/go/main/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { Pane, PaneHandle } from "./Pane";
import { TabButton } from "./TabButton";

interface TerminalViewProps {
  projectName: string;
  services: { name: string }[];
}

export function TerminalView({ projectName, services }: TerminalViewProps) {
  const [activePane, setActivePane] = useState<number | "all">("all");
  const [outputs, setOutputs] = useState<string[]>([]);
  const paneRefs = useRef<(PaneHandle | null)[]>([]);

  const servicesKey = useMemo(
    () => services.map((s) => s.name).join(","),
    [services]
  );
  const stableServices = useMemo(() => services, [servicesKey]);

  const showAll = activePane === "all";
  const hasMultiple = stableServices.length > 1;

  const handleClear = useCallback(() => {
    if (showAll) {
      paneRefs.current.forEach((ref) => ref?.clear());
    } else if (typeof activePane === "number") {
      paneRefs.current[activePane]?.clear();
    }
  }, [showAll, activePane]);

  useEffect(() => {
    const paneIndices = stableServices.map((_, i) => i);
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const prevOutputs: string[] = [];
    const poll = async () => {
      try {
        const results = await Promise.all(
          stableServices.map((_, i) =>
            GetServiceLogs(projectName, i, 500).catch(() => "(no output)")
          )
        );
        const changed = results.some((r, i) => r !== prevOutputs[i]);
        if (changed) {
          results.forEach((r, i) => (prevOutputs[i] = r));
          setOutputs(results);
        }
      } catch {}
    };

    poll();

    const handleLogEvent = (paneIndex: number, content: string) => {
      setOutputs((prev) => {
        if (prev[paneIndex] === content) return prev;
        const next = [...prev];
        next[paneIndex] = content;
        return next;
      });
    };

    try {
      EventsOn("log-update", handleLogEvent);
      WatchLogs(projectName, paneIndices, 500).catch(() => {
        fallbackInterval = setInterval(poll, 500);
      });
    } catch {
      fallbackInterval = setInterval(poll, 500);
    }

    // If WatchLogs succeeds but no events arrive, polling covers us via the initial poll.
    // Start fallback polling after a short delay to ensure data stays fresh.
    const fallbackTimer = setTimeout(() => {
      if (!fallbackInterval) {
        fallbackInterval = setInterval(poll, 500);
      }
    }, 2000);

    return () => {
      clearTimeout(fallbackTimer);
      try { EventsOff("log-update"); } catch {}
      try { StopWatchLogs(); } catch {}
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [projectName, stableServices]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden border-t border-[var(--border)]">
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1">
        {hasMultiple && (
          <TabButton
            label="all"
            active={showAll}
            onClick={() => setActivePane("all")}
          />
        )}
        {stableServices.map((svc, i) => (
          <TabButton
            key={svc.name}
            label={svc.name}
            active={activePane === i}
            onClick={() => setActivePane(i)}
          />
        ))}
        <button
          onClick={handleClear}
          className="ml-auto rounded px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        >
          Clear
        </button>
      </div>

      <div
        className={`flex flex-1 overflow-hidden ${showAll && hasMultiple ? "divide-x divide-[var(--border)]" : ""}`}
      >
        {stableServices.map((svc, i) => {
          const visible = showAll || activePane === i;
          return (
            <div
              key={svc.name}
              className={
                visible
                  ? "flex flex-1 flex-col overflow-hidden"
                  : "hidden"
              }
            >
              <Pane
                ref={(el) => {
                  paneRefs.current[i] = el;
                }}
                label={showAll && hasMultiple ? svc.name : undefined}
                output={outputs[i] || ""}
                visible={visible}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
