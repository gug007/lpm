import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { InstructionsDefaultActions } from "./InstructionsDefaultActions";
import { StatusChip } from "./ui/StatusChip";
import { CARD_CLASS } from "./ui/fields";

interface InstructionsCardProps {
  label: string;
  content: string;
  defaultText: string;
  // A project's instructions fall back to the global ones when left blank.
  resetClears?: boolean;
  minRows: number;
  // A field inside a card the caller draws, rather than a card of its own.
  bare?: boolean;
  onChange: (content: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

function sourceLabel(content: string, defaultText: string, resetClears: boolean): { text: string; custom: boolean } {
  if (!content.trim()) return { text: resetClears ? "Using global" : "Empty", custom: false };
  if (content.trim() === defaultText.trim()) return { text: "Default", custom: false };
  return { text: "Custom", custom: true };
}

export function InstructionsCard({
  label,
  content,
  defaultText,
  resetClears = false,
  minRows,
  bare = false,
  onChange,
  onKeyDown,
}: InstructionsCardProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const source = sourceLabel(content, defaultText, resetClears);

  // One line and the borders on top of the text, read once: the field's style
  // doesn't change as it's typed in.
  const extraRef = useRef<number | null>(null);

  // The text plus one empty line to keep typing into.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (extraRef.current === null) {
      const line = parseFloat(getComputedStyle(el).lineHeight) || 0;
      extraRef.current = line + el.offsetHeight - el.clientHeight;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + extraRef.current}px`;
  }, [content]);

  return (
    <section className={bare ? "" : CARD_CLASS}>
      <div className="flex min-h-11 items-center gap-2 px-4 pb-2 pt-3">
        <label htmlFor={id} className="text-[12px] font-semibold text-[var(--text-primary)]">
          {label}
        </label>
        <StatusChip tone={source.custom ? "success" : "neutral"}>{source.text}</StatusChip>
        <div className="ml-auto">
          <InstructionsDefaultActions
            content={content}
            defaultText={defaultText}
            resetClears={resetClears}
            onChange={onChange}
          />
        </div>
      </div>
      <div className="px-3 pb-3">
        <textarea
          ref={ref}
          id={id}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          rows={minRows}
          placeholder={defaultText}
          className="block w-full resize-none overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-muted)]/70 hover:border-[var(--text-muted)]/50 focus:border-[var(--text-muted)] focus:ring-2 focus:ring-[var(--text-muted)]/15"
        />
      </div>
    </section>
  );
}
