"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { StreamingOutput } from "./terminal-pane";
import type { DemoAction } from "./projects";

type Phase = "idle" | "running" | "result";

export function DemoActionModal({
  action,
  onClose,
}: {
  action: DemoAction;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(action.confirm ? "idle" : "running");

  const durationMs = action.durationMs ?? 1000;

  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setTimeout(() => setPhase("result"), durationMs);
    return () => window.clearTimeout(id);
  }, [phase, durationMs]);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={phase === "running" ? undefined : onClose}
        className="absolute inset-0 bg-black/50"
      />
      {phase === "idle" ? (
        <div className="relative w-72 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 shadow-xl">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Run{" "}
            <span className="font-medium text-gray-900 dark:text-white">
              {action.label}
            </span>
            ?
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setPhase("running")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-85 ${
                action.confirm
                  ? "bg-red-500 text-white"
                  : "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              }`}
            >
              Run
            </button>
          </div>
        </div>
      ) : (
        <div className="relative w-[28rem] max-w-[calc(100%-2rem)] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {phase === "result" ? `${action.label} finished` : `Running ${action.label}`}
            </h3>
            {phase === "result" ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="w-3 h-3" />
                success
              </span>
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            )}
          </div>
          <div className="mt-3 h-52 flex flex-col rounded-lg border border-gray-800 overflow-hidden">
            <StreamingOutput output={action.output} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">
              {phase === "result" ? `exit 0 · ${durationMs}ms` : " "}
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={phase === "running"}
              className="rounded-lg bg-gray-900 dark:bg-white dark:text-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-all hover:opacity-85 disabled:opacity-40"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
