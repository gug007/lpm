import { useLayoutEffect, useRef } from "react";
import { isImeComposing } from "../../imeComposing";

const MAX_HEIGHT = 160;

interface TalkPromptFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

// The prompt the agent will get, open to changes until Approve. It grows with
// what it holds; Return approves and Shift+Return starts a new line.
export function TalkPromptField({ value, onChange, onSubmit }: TalkPromptFieldProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    const border = field.offsetHeight - field.clientHeight;
    field.style.height = `${Math.min(field.scrollHeight + border, MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <textarea
      ref={fieldRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !isImeComposing(e)) {
          e.preventDefault();
          onSubmit();
        }
      }}
      rows={1}
      aria-label="Prompt"
      placeholder="What the agent should do"
      className="min-w-0 flex-1 resize-none overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[13px] leading-[18px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]"
    />
  );
}
