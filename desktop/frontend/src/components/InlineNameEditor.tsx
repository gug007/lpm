import { useState } from "react";
import { CheckIcon } from "./icons";
import { modalInputDefaults } from "../forms/styles";

interface InlineNameEditorProps {
  initial: string;
  placeholder?: string;
  commitTitle: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function InlineNameEditor({
  initial,
  placeholder,
  commitTitle,
  onCommit,
  onCancel,
}: InlineNameEditorProps) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  const dirty = trimmed.length > 0 && trimmed !== initial;

  const commit = () => {
    if (dirty) onCommit(trimmed);
  };

  return (
    <>
      <input
        autoFocus
        {...modalInputDefaults}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded border border-[var(--accent-cyan)] bg-[var(--bg-primary)] px-1 py-0 text-[13px] text-[var(--text-primary)] outline-none"
      />
      <button
        onClick={commit}
        disabled={!dirty}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-green)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"
        title={commitTitle}
      >
        <CheckIcon />
      </button>
    </>
  );
}
