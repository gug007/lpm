import { useState, useEffect, useMemo, useRef } from "react";
import { GetServiceLogs } from "../../wailsjs/go/main/App";
import { Pane } from "./Pane";
import { TabButton } from "./TabButton";

interface TerminalViewProps {
  projectName: string;
  services: { name: string }[];
}

export function TerminalView({ projectName, services }: TerminalViewProps) {
  const [activePane, setActivePane] = useState<number | "all">("all");
  const [outputs, setOutputs] = useState<string[]>([]);
  const prevOutputs = useRef<string[]>([]);

  const servicesKey = useMemo(
    () => services.map((s) => s.name).join(","),
    [services]
  );
  const stableServices = useMemo(() => services, [servicesKey]);

  const showAll = activePane === "all";
  const hasMultiple = stableServices.length > 1;

  useEffect(() => {
    const poll = async () => {
      try {
        if (showAll) {
          const results = await Promise.all(
            stableServices.map((_, i) =>
              GetServiceLogs(projectName, i, 100).catch(() => "(no output)")
            )
          );
          const changed = results.some(
            (r, i) => r !== prevOutputs.current[i]
          );
          if (changed) {
            prevOutputs.current = results;
            setOutputs(results);
          }
        } else {
          const logs = await GetServiceLogs(projectName, activePane, 100);
          if (logs !== prevOutputs.current[0]) {
            prevOutputs.current = [logs];
            setOutputs([logs]);
          }
        }
      } catch {
        // pane may not exist yet
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [projectName, activePane, stableServices]);

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
      </div>

      {showAll && hasMultiple ? (
        <div className="flex flex-1 divide-x divide-[#333] overflow-hidden">
          {stableServices.map((svc, i) => (
            <Pane key={svc.name} label={svc.name} output={outputs[i] || ""} />
          ))}
        </div>
      ) : (
        <Pane output={outputs[0] || ""} />
      )}
    </div>
  );
}

