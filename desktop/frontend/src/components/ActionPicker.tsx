import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ActionInfo } from "../types";

interface ActionPickerProps {
  actions: ActionInfo[];
  value: string;
  onChange: (name: string) => void;
}

const GAP = 6;
const MARGIN = 12;

export function ActionPicker({ actions, value, onChange }: ActionPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = actions.find((a) => a.name === value) ?? actions[0] ?? null;

  const pick = (a: ActionInfo) => {
    onChange(a.name);
    setOpen(false);
  };

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const anchor = trigger.getBoundingClientRect();
    const height = menu.getBoundingClientRect().height;
    let top = anchor.bottom + GAP;
    if (top + height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, anchor.top - GAP - height);
    }
    setPos({ top, left: anchor.left, width: anchor.width });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
    else setPos(null);
  }, [open, actions.length, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  return (
    <div className="relative mt-2">
      <button
        ref={triggerRef}
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

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: pos?.width,
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-[9999] max-h-60 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl"
          >
            {actions.map((a) => {
              const isSelected = a.name === selected?.name;
              return (
                <button
                  key={a.name}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
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
          </div>,
          document.body,
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
