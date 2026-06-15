import { useState } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import type { ActionInfo } from "../types";

interface ActionPickerProps {
  actions: ActionInfo[];
  value: string;
  onChange: (name: string) => void;
}

export function ActionPicker({ actions, value, onChange }: ActionPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const selected = actions.find((a) => a.name === value) ?? actions[0] ?? null;

  const pick = (a: ActionInfo) => {
    onChange(a.name);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-[var(--bg-secondary)] px-3 py-2.5 text-left text-sm transition-colors ${
          open ? "border-[var(--accent-cyan)]" : "border-[var(--border)] hover:bg-[var(--bg-hover)]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.emoji && <span className="shrink-0">{selected.emoji}</span>}
          <span className="truncate text-[var(--text-primary)]">
            {selected ? selected.label || selected.name : "Select an action"}
          </span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-[70] mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl">
          {actions.map((a) => {
            const isSelected = a.name === selected?.name;
            return (
              <button
                key={a.name}
                type="button"
                onClick={() => pick(a)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
                  isSelected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                }`}
              >
                {a.emoji && <span className="shrink-0">{a.emoji}</span>}
                <span className="min-w-0 flex-1 truncate">{a.label || a.name}</span>
                {isSelected && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-[var(--accent-cyan)]"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-[var(--text-secondary)] transition-transform ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
