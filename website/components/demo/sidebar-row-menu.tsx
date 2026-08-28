"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Clipboard,
  Copy,
  GitBranch,
  MessageSquare,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { FOCUS_RING } from "./ui";

const VIEWPORT_MARGIN = 8;

type Item = { label: string; icon: LucideIcon; shortcut?: string };

const ITEMS: Item[] = [
  { label: "Duplicate", icon: Copy },
  { label: "New Worktree", icon: GitBranch },
  { label: "Edit Config", icon: Pencil, shortcut: "⌘E" },
  { label: "Notes", icon: MessageSquare, shortcut: "⌘⇧N" },
  { label: "Rename", icon: Pencil },
  { label: "Copy path", icon: Clipboard },
];

const ITEM_CLASS =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] outline-none transition-colors";

/** The menu a project row opens on right-click or from its ⋮. The demo has
 *  nothing behind these commands, so every one of them just closes — what it
 *  is here to show is that the row has them at all. */
export function SidebarRowMenu({
  x,
  y,
  label,
  onClose,
}: {
  x: number;
  y: number;
  label: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // The menu opens at the pointer, so it has to pull itself back inside the
  // viewport before it paints — a row near the bottom would open off-screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN)),
      top: Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN)),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Coordinates captured on open: anything that moves the row strands it.
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Options for ${label}`}
      style={{ left: pos.left, top: pos.top }}
      className="menu-pop fixed z-[80] min-w-[180px] rounded-lg border border-[#2e2e2e] bg-[#1a1a1a] py-1 shadow-lg"
    >
      {ITEMS.map(({ label: item, icon: Icon, shortcut }) => (
        <button
          key={item}
          type="button"
          role="menuitem"
          onClick={onClose}
          className={`${ITEM_CLASS} ${FOCUS_RING} text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span className="min-w-0 flex-1 truncate">{item}</span>
          {shortcut && <span className="shrink-0 text-[10px] text-[#8e8e8e]">{shortcut}</span>}
        </button>
      ))}
      <div className="my-1 h-px bg-[#2e2e2e]" />
      <button
        type="button"
        role="menuitem"
        onClick={onClose}
        className={`${ITEM_CLASS} ${FOCUS_RING} text-[#f87171] hover:bg-[#2a2a2a]`}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate">Remove from lpm</span>
      </button>
    </div>
  );
}
