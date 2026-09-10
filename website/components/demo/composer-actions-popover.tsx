"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { Check, Loader2, Minimize2, Sparkles } from "lucide-react";
import { ComposerIconButton } from "./composer-icon-button";
import { FOCUS_RING } from "./ui";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

type Rewrite = {
  id: string;
  label: string;
  // What the row says when the rewrite leaves the prompt exactly as it was.
  settledLabel: string;
  icon: IconType;
  apply: (text: string) => string;
};

// Long enough to read as work rather than a swap, short enough not to stall the
// visitor — the same beat the branch name generator uses.
const REFINE_MS = 650;
// How long the row holds its "nothing to change" answer before going back to
// being a button.
const SETTLED_MS = 1100;

const FILLER =
  /\b(please|kindly|could you|can you|would you|i want you to|i'd like you to|i think|maybe|just|really|actually|basically|sort of|kind of|if possible|for me)\b/gi;

// Stock long-winded phrasings and the shorter thing they meant.
const VERBOSE: [RegExp, string][] = [
  [/\b(?:take|have) a look at\b/gi, "check"],
  [/\bmake sure(?: that)?\b/gi, "ensure"],
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\b(?:at this point in time|at the moment|right now)\b/gi, "now"],
  [/\bit (?:seems|looks|appears) (?:like|as though|that)\b/gi, ""],
  [/\ball of the\b/gi, "all"],
  [/\bas well as\b/gi, "and"],
  [/\bgo ahead and\b/gi, ""],
  [/\s+(?:too|as well)(?=[.!?]*\s*$)/gi, ""],
];

function condense(text: string): string {
  return text
    .replace(FILLER, "")
    .replace(/\s+/g, " ")
    // Lifting a word out from between two commas leaves the punctuation behind.
    .replace(/\s+([,;:])/g, "$1")
    .replace(/,(?:\s*,)+/g, ",")
    .replace(/^[\s,;:.-]+/, "")
    .replace(/[\s,;:.!?]+$/, "")
    .trim();
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// There is no undo in the composer, so a prompt that condenses to nothing —
// all filler, or punctuation only — comes back as it was typed.
function core(text: string): string {
  return sentenceCase(condense(text) || text.trim());
}

// A sentence opening on a pronoun is the one before it seen from the other side
// ("Fix the redirect. It breaks on Safari…"), so it folds into what it refers
// back to instead of standing as a second instruction. Dropping the subject only
// stays grammatical in front of a full verb, so a follow-on that carries on with
// a copula ("This is a regression") is left to stand on its own.
const BACK_REFERENCE =
  /^(?:it|this|that|they|these|those)\s+(?!(?:is|are|was|were|will|would|should|could|can|may|might|must|has|have|had|does|did|said|means)\b)/i;

type Sentence = { body: string; end: string };

// Tightens every sentence rather than cutting at the first full stop: the tail
// of "do X. And do Y too." is a second instruction, not padding. Each sentence
// keeps the mark it was typed with, so a question stays a question.
function tighten(text: string): string {
  const kept: Sentence[] = [];
  for (const raw of text.match(/[^.!?]+[.!?]*/g) ?? [text]) {
    const body = condense(
      VERBOSE.reduce((s, [wordy, terse]) => s.replace(wordy, terse), raw),
    );
    if (!body) continue;
    const end = raw.trim().match(/[.!?]+$/)?.[0] ?? "";
    const previous = kept[kept.length - 1];
    if (previous && BACK_REFERENCE.test(body)) {
      previous.body = `${previous.body} — ${body.replace(BACK_REFERENCE, "")}`;
      previous.end = end;
      continue;
    }
    kept.push({ body: sentenceCase(body), end });
  }
  return kept.length > 0
    ? kept.map(({ body, end }) => body + end).join(" ")
    : text.trim();
}

// The two rewrites the app ships enabled out of the box. There is no model
// behind the demo, so each one is a deterministic transform of what you typed —
// built from your own words rather than a canned string, so the field turns into
// something you can still recognise as your prompt.
const REWRITES: Rewrite[] = [
  {
    id: "improve",
    label: "Improve prompt",
    settledLabel: "Nothing to add",
    icon: Sparkles,
    apply: (text) =>
      `${core(text)}. Name the files you touch, explain the root cause before changing anything, make the smallest fix that covers it, and add a test that fails without the change.`,
  },
  {
    id: "concise",
    label: "Make concise",
    settledLabel: "Already concise",
    icon: Minimize2,
    apply: tighten,
  },
];

const ROW = `flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12.5px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;

/** The composer's sparkle: AI rewrites of the text already in the field. */
export function ComposerActionsPopover({
  value,
  onApply,
}: {
  value: string;
  onApply: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [settled, setSettled] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const canRun = value.trim().length > 0;

  const clearTimer = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    if (!open) return;
    // Dismissing mid-rewrite drops it, so the transform can't land in a popover
    // the visitor already closed.
    const dismiss = () => {
      clearTimer();
      setPending(null);
      setSettled(null);
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const run = (rewrite: Rewrite) => {
    if (!canRun || pending) return;
    const text = value;
    clearTimer();
    setSettled(null);
    setPending(rewrite.id);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setPending(null);
      const next = rewrite.apply(text);
      // A rewrite with nothing to change says so on its own row: closing on an
      // untouched field reads as a dead button, not as a considered answer.
      if (next === text.trim()) {
        setSettled(rewrite.id);
        timer.current = window.setTimeout(() => {
          timer.current = null;
          setSettled(null);
        }, SETTLED_MS);
        return;
      }
      setOpen(false);
      onApply(next);
    }, REFINE_MS);
  };

  return (
    <div ref={ref} className="relative">
      <ComposerIconButton
        label="AI actions"
        // The popover opens straight over where the tooltip sits, so the label
        // stands down once the menu it describes is on screen.
        tooltip={open ? "" : "Refine with AI"}
        onClick={() => setOpen((v) => !v)}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </ComposerIconButton>
      {open && (
        <div
          aria-label="AI actions"
          className="menu-pop absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] py-1.5 shadow-2xl"
        >
          {REWRITES.map((rewrite) => {
            const refining = pending === rewrite.id;
            const done = settled === rewrite.id;
            const Icon = refining ? Loader2 : done ? Check : rewrite.icon;
            return (
              <button
                key={rewrite.id}
                type="button"
                // Don't pull focus off the field, so the caret stays where it was.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(rewrite)}
                disabled={!canRun || pending !== null}
                title={canRun ? undefined : "Type something first"}
                className={ROW}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${done ? "text-[#4ade80]" : "text-[#919191]"} ${refining ? "animate-spin" : ""}`}
                  strokeWidth={done ? 2 : 1.75}
                />
                <span className="min-w-0 flex-1 truncate" aria-live="polite">
                  {refining ? "Refining…" : done ? rewrite.settledLabel : rewrite.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
