"use client";

import { History, Mic, Plus, Sparkles } from "lucide-react";
import type { FormEvent, ReactNode, RefObject } from "react";
import { ComposerIconButton } from "./composer-icon-button";
import { ComposerSendButton } from "./composer-send-button";
import { NO_AUTOFILL } from "./no-autofill";
import { useReducedMotion } from "./ui";

// The conic ring the app spins around the composer while a turn is in flight.
const RUNNING_RING =
  "[background:conic-gradient(from_var(--gradient-angle),#6366f1,#a855f7,#ec4899,#06b6d4,#6366f1)]";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onStop: () => void;
  busy: boolean;
  placeholder: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onSuggest: () => void;
  onRecall: () => void;
  canRecall: boolean;
  // Rendered above the box, inside the composer's own padding.
  children?: ReactNode;
};

export function AgentComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  placeholder,
  inputRef,
  onSuggest,
  onRecall,
  canRecall,
  children,
}: Props) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="shrink-0 border-t border-[rgba(204,204,204,0.18)] bg-[#1a1a1a] px-3 pb-1 pt-2">
      {children}
      <form onSubmit={onSubmit} autoComplete="off">
        <div
          className={`rounded-xl p-px ${
            busy
              ? `${RUNNING_RING} ${reducedMotion ? "" : "animate-[gradient-spin_3s_linear_infinite]"}`
              : ""
          }`}
        >
          <div
            className={`rounded-xl bg-[#262626] transition-colors ${
              busy
                ? "border border-transparent"
                : "border border-[rgba(204,204,204,0.18)] focus-within:border-[rgba(204,204,204,0.4)]"
            }`}
          >
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
                <ComposerIconButton
                  label="Dictate"
                  tooltip="Dictate"
                  onClick={() => inputRef.current?.focus()}
                >
                  <Mic className="h-3.5 w-3.5" />
                </ComposerIconButton>
                <ComposerIconButton
                  label="Suggest a prompt"
                  tooltip="Suggest a prompt"
                  onClick={onSuggest}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </ComposerIconButton>
                <ComposerIconButton
                  label="New input"
                  tooltip={"New prompt  ·  ⌘⇧T"}
                  onClick={() => inputRef.current?.focus()}
                >
                  <Plus className="h-4 w-4" />
                </ComposerIconButton>
                <ComposerIconButton
                  label="Message history"
                  tooltip="Recent messages"
                  disabled={!canRecall}
                  onClick={onRecall}
                >
                  <History className="h-3.5 w-3.5" />
                </ComposerIconButton>
              </div>
              <ComposerSendButton
                busy={busy}
                disabled={!value.trim()}
                onStop={onStop}
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
