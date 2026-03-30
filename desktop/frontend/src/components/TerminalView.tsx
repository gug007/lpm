import { useState, useEffect, useRef } from "react";
import { GetServiceLogs } from "../../wailsjs/go/main/App";

interface TerminalViewProps {
  projectName: string;
  services: { name: string }[];
}

export function TerminalView({ projectName, services }: TerminalViewProps) {
  const [activePane, setActivePane] = useState(-1);
  const [outputs, setOutputs] = useState<string[]>([]);
  const prevOutputs = useRef<string[]>([]);

  const showAll = activePane === -1;
  const hasMultiple = services.length > 1;

  useEffect(() => {
    const poll = async () => {
      try {
        if (showAll) {
          const results = await Promise.all(
            services.map((_, i) =>
              GetServiceLogs(projectName, i, 100).catch(() => "(no output)")
            )
          );
          const changed = results.some((r, i) => r !== prevOutputs.current[i]);
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
  }, [projectName, activePane, showAll, services]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden border-t border-[var(--border)]">
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1">
        {hasMultiple && (
          <TabButton
            label="all"
            active={showAll}
            onClick={() => setActivePane(-1)}
          />
        )}
        {services.map((svc, i) => (
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
          {services.map((svc, i) => (
            <Pane
              key={svc.name}
              label={svc.name}
              output={outputs[i] || ""}
            />
          ))}
        </div>
      ) : (
        <SinglePane output={outputs[0] || ""} />
      )}
    </div>
  );
}

function Pane({ label, output }: { label: string; output: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [output]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-[#333] bg-[#111] px-3 py-1">
        <span className="text-[10px] font-medium text-[#666]">{label}</span>
      </div>
      <pre
        ref={ref}
        className="flex-1 overflow-auto whitespace-pre bg-[#0d0d0d] p-2 font-mono text-[11px] leading-relaxed text-[#ccc]"
      >
        {output || "Waiting for output..."}
      </pre>
    </div>
  );
}

function SinglePane({ output }: { output: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [output]);

  return (
    <pre
      ref={ref}
      className="flex-1 overflow-auto whitespace-pre bg-[#0d0d0d] p-3 font-mono text-xs leading-relaxed text-[#ccc]"
    >
      {output || "Waiting for output..."}
    </pre>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {label}
    </button>
  );
}
