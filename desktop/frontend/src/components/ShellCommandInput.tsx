import { useEffect, useRef } from "react";
import { FIELD_CLASS } from "./ui/fields";

const MAX_HEIGHT = 160;

interface ShellCommandInputProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

// A command field that reads like a shell line: a leading "$" prompt glyph with
// the text starting just past it. Grows with its content like the prompt field,
// so multi-line commands stay readable (Shift+Enter adds a line, Enter submits).
export function ShellCommandInput({
  value,
  onChange,
  autoFocus,
  placeholder = "Enter a command…",
}: ShellCommandInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-2 font-mono text-[13px] leading-snug text-[var(--text-muted)]">
        $
      </span>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={1}
        placeholder={placeholder}
        className={`${FIELD_CLASS} block max-h-[160px] min-h-[36px] resize-none py-2 pl-7 pr-3 font-mono leading-snug`}
      />
    </div>
  );
}
