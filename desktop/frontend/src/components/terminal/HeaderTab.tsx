import { useState, useEffect, useRef } from "react";
import { XIcon } from "../icons";

export function HeaderTab({ label, active, onClick, onClose, onRename, shimmer, done }: {
  label: string;
  active: boolean;
  onClick: () => void;
  onClose?: () => void;
  onRename?: (name: string) => void;
  shimmer?: boolean;
  done?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(label);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== label) onRename?.(trimmed);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 rounded-md bg-[var(--terminal-header-active)] px-2 py-1 font-mono text-[11px] font-medium text-[var(--terminal-tab-active)] outline-none"
      />
    );
  }

  return (
    <button
      onClick={onClick}
      onDoubleClick={onRename ? () => setEditing(true) : undefined}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--terminal-header-active)] text-[var(--terminal-tab-active)]"
          : "text-[var(--terminal-header-text)] hover:text-[var(--terminal-tab-active)]"
      }`}
    >
      <span className={shimmer ? "sidebar-shimmer" : ""} style={done && !shimmer ? { color: "var(--accent-blue)" } : undefined}>{label}</span>
      {onClose && (
        <span
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="ml-0.5 rounded p-0.5 opacity-60 hover:bg-[var(--terminal-header-hover)] hover:opacity-100"
        >
          <XIcon />
        </span>
      )}
    </button>
  );
}
