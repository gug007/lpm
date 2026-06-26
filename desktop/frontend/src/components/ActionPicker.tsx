import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ActionInfo } from "../types";
import {
  findActionByPath,
  hasRunnableDescendant,
  isRunnableAction,
} from "../actionTree";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

interface ActionPickerProps {
  // The full action tree. Runnable leaves and split-button defaults are
  // selectable; menus and split buttons drill into their children.
  actions: ActionInfo[];
  value: string;
  onChange: (name: string) => void;
}

const GAP = 6;
const MARGIN = 12;

export function ActionPicker({ actions, value, onChange }: ActionPickerProps) {
  const [open, setOpen] = useState(false);
  // The chain of parents drilled into; the last one's children are shown.
  const [stack, setStack] = useState<ActionInfo[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const selected = findActionByPath(actions, value);
  const parent = stack[stack.length - 1];
  const level = parent?.children ?? actions;
  // Hide leaves that can't run unattended, and menus/splits with nothing
  // runnable to drill to.
  const items = level.filter((a) =>
    a.children?.length
      ? isRunnableAction(a) || hasRunnableDescendant(a)
      : isRunnableAction(a),
  );

  const close = () => {
    setOpen(false);
    setStack([]);
  };
  const pick = (a: ActionInfo) => {
    onChange(a.name);
    close();
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
    // Drilling changes the menu's height, so re-anchor on stack changes too.
  }, [open, stack.length, items.length, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
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
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-[var(--bg-secondary)] px-3 py-2.5 text-left text-sm transition-colors ${
          open
            ? "border-[var(--accent-cyan)]"
            : "border-[var(--border)] hover:bg-[var(--bg-hover)]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.emoji && (
            <span className="shrink-0">{selected.emoji}</span>
          )}
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
            {parent && (
              <button
                type="button"
                onClick={() => setStack((s) => s.slice(0, -1))}
                className="mb-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <span className="shrink-0">
                  <ChevronLeftIcon />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {parent.label || parent.name}
                </span>
              </button>
            )}

            {items.map((a) => {
              const branch = !!a.children?.length;
              const isSelected = a.name === value;
              const rowText = isSelected
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)]";

              // Split button: a runnable parent with children — the label selects
              // its default action, a trailing chevron drills into the rest.
              if (branch && isRunnableAction(a)) {
                return (
                  <div
                    key={a.name}
                    className="flex items-center rounded-lg text-sm transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <button
                      type="button"
                      onClick={() => pick(a)}
                      className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left ${rowText} hover:text-[var(--text-primary)]`}
                    >
                      <RowBody action={a} />
                      {isSelected && <SelectedCheck />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStack((s) => [...s, a])}
                      aria-label={`Open ${a.label || a.name}`}
                      className="flex shrink-0 items-center self-stretch border-l border-[var(--border)] px-2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      <ChevronRightIcon />
                    </button>
                  </div>
                );
              }

              // Pure menu: drill only.
              if (branch) {
                return (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => setStack((s) => [...s, a])}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <RowBody action={a} />
                    <span className="shrink-0 text-[var(--text-muted)]">
                      <ChevronRightIcon />
                    </span>
                  </button>
                );
              }

              // Runnable leaf: select.
              return (
                <button
                  key={a.name}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(a)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${rowText}`}
                >
                  <RowBody action={a} />
                  {isSelected && <SelectedCheck />}
                </button>
              );
            })}

            {items.length === 0 && (
              <div className="px-3 py-2 text-sm text-[var(--text-muted)]">
                No actions
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

// The shared body of every row: the action's emoji and its truncated label.
function RowBody({ action }: { action: ActionInfo }) {
  return (
    <>
      {action.emoji && <span className="shrink-0">{action.emoji}</span>}
      <span className="min-w-0 flex-1 truncate">
        {action.label || action.name}
      </span>
    </>
  );
}

function SelectedCheck() {
  return (
    <span className="shrink-0 text-[var(--accent-cyan)]">
      <CheckIcon />
    </span>
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
