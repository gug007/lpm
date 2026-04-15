"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Spinner } from "./spinner";
import type { Action, ModalPhase } from "./types";

const RUNNING_DURATION_MS = 650;

export function ActionModal({
  action,
  initialPhase = "idle",
  onClose,
  onRun,
}: {
  action: Action;
  initialPhase?: ModalPhase;
  onClose: () => void;
  // When provided, overrides the default idle → running transition so the
  // caller can run the action outside the modal (e.g. background actions
  // that render as a toast instead of a streaming modal).
  onRun?: () => void;
}) {
  const [phase, setPhase] = useState<ModalPhase>(initialPhase);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const start = performance.now();
    const id = window.setTimeout(() => {
      setDuration(Math.round(performance.now() - start));
      setPhase("result");
    }, RUNNING_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase === "idle") {
    return (
      <IdleDialog
        action={action}
        onCancel={onClose}
        onRun={onRun ?? (() => setPhase("running"))}
      />
    );
  }

  return (
    <ResultDialog
      action={action}
      phase={phase}
      duration={duration}
      busy={phase === "running"}
      onClose={onClose}
    />
  );
}

function IdleDialog({
  action,
  onCancel,
  onRun,
}: {
  action: Action;
  onCancel: () => void;
  onRun: () => void;
}) {
  const destructive = action.confirm === true;
  const runClasses = destructive
    ? "bg-red-500 text-white"
    : "bg-gray-900 text-white dark:bg-white dark:text-gray-900";
  return (
    <ModalOverlay onBackdropClick={onCancel}>
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
            onClick={onCancel}
            className="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onRun}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-85 disabled:opacity-40 ${runClasses}`}
          >
            Run
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ResultDialog({
  action,
  phase,
  duration,
  busy,
  onClose,
}: {
  action: Action;
  phase: "running" | "result";
  duration: number | null;
  busy: boolean;
  onClose: () => void;
}) {
  const title =
    phase === "result" ? `${action.label} finished` : `Running ${action.label}`;
  return (
    <ModalOverlay onBackdropClick={busy ? undefined : onClose}>
      <div className="relative w-80 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          {phase === "result" && <SuccessPill />}
        </div>

        <TerminalOutput action={action} phase={phase} duration={duration} />

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-900"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({
  children,
  onBackdropClick,
}: {
  children: ReactNode;
  onBackdropClick: (() => void) | undefined;
}) {
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onBackdropClick}
        className="absolute inset-0 bg-black/40"
      />
      {children}
    </div>
  );
}

function SuccessPill() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      <Check className="w-3 h-3" />
      success
    </span>
  );
}

function TerminalOutput({
  action,
  phase,
  duration,
}: {
  action: Action;
  phase: "running" | "result";
  duration: number | null;
}) {
  return (
    <div className="mt-3 rounded-lg border border-gray-800 bg-[#1a1a1a] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-gray-100">
      <div className="text-emerald-400 break-all">
        $ {action.cmd || "(no cmd)"}
      </div>
      {phase === "running" ? (
        <div className="mt-1 flex items-center gap-2 text-gray-400">
          <Spinner className="w-3 h-3" />
          <span>Running…</span>
        </div>
      ) : (
        <>
          <div className="mt-0.5 text-gray-400">
            {action.label} completed without errors.
          </div>
          <div className="mt-2 flex items-center justify-between text-gray-500">
            <span>exit code 0</span>
            {duration !== null && <span>{duration}ms</span>}
          </div>
        </>
      )}
    </div>
  );
}
