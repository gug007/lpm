import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon } from "../../icons";

// A custom right-aligned dropdown that replaces the native <select>: a quiet
// trigger showing the current value, opening an anchored, scrollable list with a
// check on the selection. The menu is portaled with fixed positioning so it's
// never clipped by the modal's scroll container, and re-anchors on scroll/resize.
export function RowSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight: number;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  // Open downward when there's room, otherwise flip above the trigger; either
  // way cap the list to the space actually available so it never runs off the
  // window (it scrolls internally instead).
  const reposition = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const right = window.innerWidth - r.right;
    const below = window.innerHeight - r.bottom - 18;
    const above = r.top - 18;
    if (below >= 200 || below >= above) {
      setPos({ top: r.bottom + 6, right, maxHeight: Math.min(320, below) });
    } else {
      setPos({
        bottom: window.innerHeight - r.top + 6,
        right,
        maxHeight: Math.min(320, above),
      });
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`-mr-1.5 flex max-w-[300px] items-center gap-1 rounded-md py-1 pl-2 pr-1.5 text-[13px] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
          open ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <span
          className={`shrink-0 scale-75 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <ChevronDownIcon />
        </span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              top: pos.top,
              bottom: pos.bottom,
              right: pos.right,
              maxHeight: pos.maxHeight,
            }}
            className="fixed z-[80] min-w-[200px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl"
          >
            {options.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] ${
                    active
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--accent-cyan)] [&_svg]:h-3.5 [&_svg]:w-3.5">
                    {active && <CheckIcon />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
