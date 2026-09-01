import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentRecentAnswers, SetClipboardText } from "../../bridge/commands";
import type { AgentSessionRef } from "../agentSession";
import { CopyIcon } from "./icons";

const LIST_LIMIT = 20;

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
  const [answers, setAnswers] = useState<string[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // The capture-phase key handler reads through a ref so it never re-binds on
  // selection moves.
  const stateRef = useRef({ answers: [] as string[], activeIdx: 0 });
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
        if (!cancelled) setAnswers(list);
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
        void copy(answers[activeIdx]);
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
      {answers.map((text, i) => (
        <button
          key={i}
          type="button"
          data-idx={i}
          // Keep the terminal focused, same as the pill itself.
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setActiveIdx(i)}
          onClick={() => void copy(text)}
          className={`flex w-full items-start gap-2.5 px-3 py-1.5 text-left text-[11px] transition-colors ${
            i === activeIdx
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)]"
          }`}
        >
          {/* The row IS the button; the glyph only labels what it does. Pinned
              to the first line so a two-line preview doesn't strand it in the
              gap between the lines. */}
          <span
            aria-hidden
            className={`mt-[2px] shrink-0 ${i === activeIdx ? "" : "text-[var(--text-muted)]"}`}
          >
            <CopyIcon size={12} />
          </span>
          <span className="line-clamp-2 min-w-0 flex-1 leading-snug">
            {answerPreview(text)}
          </span>
        </button>
      ))}
    </div>
  );
}
