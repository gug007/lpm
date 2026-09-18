"use client";

import { useEffect, useRef, useState } from "react";
import { History, Mic, Plus } from "lucide-react";
import type { FormEvent, ReactNode, RefObject } from "react";
import { ComposerActionsPopover } from "./composer-actions-popover";
import { ComposerIconButton } from "./composer-icon-button";
import { ComposerSendButton } from "./composer-send-button";
import { NO_AUTOFILL } from "./no-autofill";
import { FOCUS_RING, PRESS } from "./ui";
import { shortDuration, useSecondsClock } from "./use-seconds-clock";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  placeholder: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onRecall: () => void;
  canRecall: boolean;
  /** When the turn in flight began, so the composer can say how long the agent
   *  has been at it — what the app shows here instead of a spinner. */
  workingSince?: number;
  // Rendered in the footer row, to the left of Send.
  trailing?: ReactNode;
};

export function AgentComposer({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder,
  inputRef,
  onRecall,
  canRecall,
  workingSince,
  trailing,
}: Props) {
  const focusField = () => inputRef.current?.focus();

  return (
    <div className="shrink-0 border-t border-[rgba(204,204,204,0.18)] bg-[#1a1a1a] px-3 pb-1 pt-2">
      <form onSubmit={onSubmit} autoComplete="off">
        {/* The box stays neutral while the agent works. In the app the spinning
            ring belongs to a composer transform, not to a turn in flight; what
            a working turn puts here is an elapsed reading. */}
        <div className="rounded-xl p-px">
          {/* The app's own focus border is too faint to be the whole indicator,
              so the box also takes the demo's blue ring while the field itself
              holds focus — the footer buttons keep their own FOCUS_RING. */}
          <div className="rounded-xl border border-[rgba(204,204,204,0.18)] bg-[#262626] transition-colors focus-within:border-[rgba(204,204,204,0.4)] has-[input:focus-visible]:border-[#60a5fa] has-[input:focus-visible]:ring-1 has-[input:focus-visible]:ring-[#60a5fa]">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              {...NO_AUTOFILL}
              className="block w-full bg-transparent px-3.5 py-1.5 font-mono text-[12px] leading-[1.5] text-[#cccccc] caret-[#cccccc] outline-none placeholder:text-[#8e8e8e]"
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <div className="flex items-center gap-1">
                <DictateButton
                  onTranscript={(text) => {
                    const typed = value.trimEnd();
                    onChange(typed ? `${typed} ${text}` : text);
                    focusField();
                  }}
                />
                <ComposerActionsPopover
                  value={value}
                  onApply={(text) => {
                    onChange(text);
                    focusField();
                  }}
                />
                <ComposerIconButton
                  label="New input"
                  tooltip={"New prompt  ·  ⌘⇧T"}
                  onClick={() => {
                    onChange("");
                    focusField();
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </ComposerIconButton>
                <ComposerIconButton
                  label="Message history"
                  tooltip="Recent messages"
                  disabled={!canRecall}
                  onClick={onRecall}
                >
                  <History className="h-3.5 w-3.5" />
                </ComposerIconButton>
                {busy && workingSince !== undefined && (
                  <WorkingFor since={workingSince} />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {trailing}
                <ComposerSendButton disabled={!value.trim()} />
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// What the demo hears when you dictate. Written the way people actually talk to
// an agent — filler and all — so the AI actions beside it have something to
// tighten up.
const TRANSCRIPT = "can you take a look at the failing test and just fix it please";
const DICTATION_MS = 2000;

/** Dictation is a toggle in the app: it records until you stop it, then adds
 *  what it heard to the field that had focus. */
function DictateButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const timer = useRef<number | null>(null);
  // The auto-stop fires two seconds after the click, so it has to hand the
  // transcript to the handler as it is *then*: anything typed while recording is
  // part of the field the transcript appends to.
  const latest = useRef(onTranscript);
  useEffect(() => {
    latest.current = onTranscript;
  });

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const stop = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setRecording(false);
    latest.current(TRANSCRIPT);
  };

  if (!recording) {
    return (
      <ComposerIconButton
        label="Dictate"
        tooltip="Dictate"
        onClick={() => {
          setRecording(true);
          timer.current = window.setTimeout(stop, DICTATION_MS);
        }}
      >
        <Mic className="h-3.5 w-3.5" />
      </ComposerIconButton>
    );
  }

  return (
    <button
      type="button"
      aria-label="Stop dictation"
      // Don't pull focus off the field, so it still has focus when the transcript lands.
      onMouseDown={(e) => e.preventDefault()}
      onClick={stop}
      className={`flex h-7 items-center gap-1.5 rounded-lg bg-[#f87171]/15 px-2 text-[11px] font-medium text-[#f87171] ${PRESS} ${FOCUS_RING}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#f87171]" />
      Recording
    </button>
  );
}

/** How long the agent has been on this turn, beside the composer's own
 *  controls — the app's compact status chip. */
function WorkingFor({ since }: { since: number }) {
  const now = useSecondsClock(false);
  const elapsed = shortDuration(now - since);
  return (
    <span
      title={`Working for ${elapsed}`}
      className="ml-1 shrink-0 select-none text-[11px] tabular-nums text-[#8e8e8e]"
    >
      {elapsed}
    </span>
  );
}
