import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentRecentAnswers, SetClipboardText } from "../../bridge/commands";
import type { AgentSessionRef } from "../agentSession";
import { relativeTime } from "../relativeTime";
import { CopyIcon } from "./icons";

const LIST_LIMIT = 20;

/** An answer and when the agent gave it, in epoch milliseconds — `at` is null
 *  for a transcript record that carried no stamp. */
type Answer = { text: string; at: number | null };

// First meaningful line of an answer, stripped of markdown furniture, so the
// row reads like a sentence rather than a heading marker.
function answerPreview(text: string): string {
  for (const line of text.split("\n")) {
    const plain = line.replace(/^[\s#>*`-]+/, "").trim();
    if (plain) return plain;
  }
  return text.trim();
}

/** The pick-list inside the copy pill's menu: the session's answers, newest
 *  first, fetched fresh each time the menu opens. Click or ↑↓ + Enter copies
 *  that answer's original markdown. The keyboard path is captured at the
 *  document so the keys never fall through to the terminal, which deliberately
 *  keeps focus while the menu is open. */
export function CopyAnswerList({
  projectName,
  session,
  onCopied,
}: {
  projectName: string;
  session: AgentSessionRef;
  onCopied: () => void;
}) {
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // The capture-phase key handler reads through a ref so it never re-binds on
  // selection moves.
  const stateRef = useRef({ answers: [] as Answer[], activeIdx: 0 });
  stateRef.current = { answers: answers ?? [], activeIdx };

  useEffect(() => {
    let cancelled = false;
    AgentRecentAnswers(
      projectName,
      session.provider,
      session.sessionId,
      LIST_LIMIT,
    )
      .then((list) => {
        if (cancelled) return;
        // The command answers newest-first; the list reads oldest-down like the
        // terminal above it, which also puts the newest answer nearest the pill
        // that opened the menu.
        setAnswers([...list].reverse());
        setActiveIdx(Math.max(0, list.length - 1));
      })
      .catch((err) => {
        if (cancelled) return;
        setAnswers([]);
        toast.error(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [projectName, session.provider, session.sessionId]);

  // Opens at the newest answer, the way the terminal above it sits at its
  // newest output. Runs once per load: `answers` is set exactly once.
  useEffect(() => {
    if (!answers?.length) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [answers]);

  const copy = useRef(async (text: string) => {
    try {
      await SetClipboardText(text);
      onCopied();
    } catch (err) {
      toast.error(String(err));
    }
  }).current;

  const hasAnswers = (answers?.length ?? 0) > 0;
  useEffect(() => {
    if (!hasAnswers) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const { answers, activeIdx } = stateRef.current;
      if (e.key === "Enter") {
        void copy(answers[activeIdx].text);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = Math.min(answers.length - 1, Math.max(0, activeIdx + step));
      setActiveIdx(next);
      listRef.current
        ?.querySelector(`[data-idx="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [hasAnswers, copy]);

  if (answers === null) {
    return (
      <div className="space-y-2.5 px-3 py-2.5" aria-hidden>
        {["w-4/5", "w-3/5", "w-2/3"].map((width) => (
          <div
            key={width}
            className={`h-2.5 animate-pulse rounded bg-[var(--bg-hover)] ${width}`}
          />
        ))}
      </div>
    );
  }
  if (answers.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]">
        No answers yet
      </div>
    );
  }
  return (
    <div ref={listRef} className="max-h-[300px] overflow-y-auto">
      {answers.map((answer, i) => (
        <button
          key={i}
          type="button"
          data-idx={i}
          // Keep the terminal focused, same as the pill itself.
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setActiveIdx(i)}
          onClick={() => void copy(answer.text)}
          className={`flex w-full items-start gap-2.5 px-3 py-1.5 text-left text-[11px] transition-colors ${
            i === activeIdx
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)]"
          }`}
        >
          {/* The row IS the button; the glyph only labels what it does. Its
              space is held while hidden, so the text never shifts under the
              cursor, and it sits on the first line so a two-line preview
              doesn't strand it between the lines. */}
          <span
            aria-hidden
            className={`mt-[2px] shrink-0 transition-opacity ${
              i === activeIdx ? "opacity-100" : "opacity-0"
            }`}
          >
            <CopyIcon size={12} />
          </span>
          <span className="line-clamp-2 min-w-0 flex-1 leading-snug">
            {answerPreview(answer.text)}
          </span>
          {answer.at !== null && (
            // Its line box matches the preview's first line, so the age sits on
            // that line rather than needing a nudge of its own.
            <span className="shrink-0 text-[10px] leading-[15px] tabular-nums text-[var(--text-muted)]">
              {relativeTime(Math.floor(answer.at / 1000))}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
