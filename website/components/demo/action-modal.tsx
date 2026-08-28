"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { StreamingOutput } from "./terminal-pane";
import {
  DIALOG_PANEL_CLASS,
  DangerButton,
  PrimaryButton,
  SecondaryButton,
} from "./ui-kit";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  const durationMs = action.durationMs ?? 1000;

  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setTimeout(() => setPhase("result"), durationMs);
    return () => window.clearTimeout(id);
  }, [phase, durationMs]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    return () => {
      const trigger = returnFocusRef.current;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  // While the action runs there is no enabled button to hold focus, so the
  // dialog itself takes it rather than letting it fall back to <body>.
  useEffect(() => {
    const primary = primaryRef.current;
    if (primary && !primary.disabled) primary.focus();
    else dialogRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase === "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={phase === "running" ? undefined : onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      {phase === "idle" ? (
        <div
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
          aria-labelledby="demo-action-confirm-title"
          className={`relative w-72 ${DIALOG_PANEL_CLASS}`}
        >
          <div id="demo-action-confirm-title" className="text-sm text-[#b3b3b3]">
            Run <span className="font-medium text-[#e5e5e5]">{action.label}</span>
            ?
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            {action.confirm ? (
              <DangerButton ref={primaryRef} onClick={() => setPhase("running")}>
                Run
              </DangerButton>
            ) : (
              <PrimaryButton ref={primaryRef} onClick={() => setPhase("running")}>
                Run
              </PrimaryButton>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
          aria-labelledby="demo-action-title"
          className={`relative w-[460px] max-w-[calc(100%-2rem)] ${DIALOG_PANEL_CLASS}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div
              id="demo-action-title"
              className="text-base font-semibold text-[#e5e5e5]"
            >
              {phase === "result" ? `${action.label} finished` : `Running ${action.label}`}
            </div>
            {phase === "result" ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#4ade80]/10 px-2 py-0.5 text-[11px] font-medium text-[#4ade80]">
                <Check className="w-3 h-3" />
                success
              </span>
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-[#919191]" />
            )}
          </div>
          <div className="mt-3 h-52 flex flex-col rounded-lg border border-[#2e2e2e] overflow-hidden">
            <StreamingOutput output={action.output} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[10px] text-[#919191]">
              {phase === "result" ? `exit 0 · ${durationMs}ms` : " "}
            </span>
            <PrimaryButton
              ref={primaryRef}
              onClick={onClose}
              disabled={phase === "running"}
            >
              Close
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
