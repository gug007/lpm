import { useState, type KeyboardEvent } from "react";
import { clockLabel, countdownLabel, dayLabel, parseWhen } from "../sendLater/time";

interface SendLaterReadbackProps {
  at: number;
  now: number;
  // When the limit resets, so typing "reset" works where that pick is offered.
  limitAt: number | null;
  onTyped: (at: number, delay: boolean, limit: boolean) => void;
  // Editing ended: focus goes back to the picker, so its keys keep working.
  onDone: () => void;
}

const LIMIT_WORDS = /^(reset|resets|limit|limit reset|when (the )?limit resets)$/i;
const TYPED_DELAY = /^(in\s+)?\d+(\.\d+)?\s*(d|h|m)/i;

// The chosen moment in words, large. Clicking the time turns it into a field
// that takes a typed time ("90m", "5pm", "tomorrow 9am"), for any moment the
// line and its flags don't offer.
export function SendLaterReadback({ at, now, limitAt, onTyped, onDone }: SendLaterReadbackProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState(false);

  // Apply what was typed. False when it names no moment, and nothing changed.
  const apply = (): boolean => {
    const typed = text.trim();
    if (limitAt !== null && LIMIT_WORDS.test(typed)) {
      onTyped(limitAt, false, true);
      return true;
    }
    const parsed = parseWhen(typed, Date.now());
    if (parsed === null) return false;
    onTyped(parsed, TYPED_DELAY.test(typed) && !/(am|pm|:)/i.test(typed), false);
    return true;
  };

  const finish = () => {
    setEditing(false);
    onDone();
  };

  const commit = () => {
    if (apply()) finish();
    else setError(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
  };

  if (editing) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <input
          id="send-later-when"
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Leaving the field (clicking Schedule, say) keeps a valid typed time.
            if (text.trim()) apply();
            setEditing(false);
          }}
          placeholder="2h, 90m, 5pm, tomorrow 9am…"
          spellCheck={false}
          className="h-8 w-60 rounded-lg border border-[var(--accent-blue)] bg-[var(--bg-secondary)] px-2.5 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <span className={`text-[10.5px] ${error ? "text-[var(--accent-amber-text)]" : "text-[var(--text-muted)]"}`}>
          {error ? "Try 2h, 90m, 5pm or fri 10am" : `↵ to set${limitAt !== null ? " · “reset” for when the limit resets" : ""}`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[16px] font-medium text-[var(--text-primary)]">{dayLabel(at, now)}</span>
      <button
        type="button"
        title="Type a time"
        onClick={() => {
          setText("");
          setError(false);
          setEditing(true);
        }}
        className="text-[16px] font-medium tabular-nums text-[var(--text-primary)] underline decoration-[var(--text-muted)] decoration-dashed underline-offset-4 outline-none transition-colors hover:decoration-[var(--accent-blue)] focus-visible:decoration-[var(--accent-blue)]"
      >
        {clockLabel(at)}
      </button>
      <span className="text-[12px] tabular-nums text-[var(--accent-blue-text)]">· {countdownLabel(at, now)}</span>
    </div>
  );
}
