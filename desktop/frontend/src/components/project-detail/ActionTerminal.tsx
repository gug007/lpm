import { useState, useEffect, useRef } from "react";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { XIcon, CheckIcon } from "../icons";
import { SpinnerIcon, ErrorCircleIcon } from "./icons";

interface ActionTerminalProps {
  label: string;
  onClose: () => void;
}

export function ActionTerminal({ label, onClose }: ActionTerminalProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState<{ success: boolean; error?: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cleanupOutput = EventsOn("action-output", (data: { line: string }) => {
      setLines((prev) => [...prev, data.line]);
    });
    const cleanupDone = EventsOn("action-done", (data: { success: boolean; error?: string }) => {
      setDone(data);
    });
    return () => {
      if (typeof cleanupOutput === "function") cleanupOutput();
      if (typeof cleanupDone === "function") cleanupDone();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex w-[560px] max-h-[70vh] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-2">
            {!done && <SpinnerIcon />}
            {done?.success && <span className="text-[var(--accent-green)]"><CheckIcon /></span>}
            {done && !done.success && <ErrorCircleIcon />}
            <span className="text-xs font-medium text-[var(--text-primary)]">{label}</span>
            {done && (
              <span className={`text-[10px] ${done.success ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
                {done.success ? "completed" : "failed"}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
          >
            <XIcon />
          </button>
        </div>
        <div className="flex-1 select-text overflow-y-auto bg-[var(--terminal-bg)] px-4 py-3 font-mono text-[11px] leading-relaxed text-[var(--terminal-fg)]">
          {lines.length === 0 && !done && (
            <span className="text-[var(--text-muted)]">Running...</span>
          )}
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">{line || "\u00A0"}</div>
          ))}
          {done?.error && (
            <div className="mt-2 text-[var(--accent-red)]">{done.error}</div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
