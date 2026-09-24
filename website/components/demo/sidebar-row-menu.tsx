"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
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
const COPIED_MS = 900;

type Item = {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  action?: "duplicate" | "worktree" | "copy-path";
  // Rows this simulation does not carry out. They say so rather than
  // swallowing the click.
  inert?: string;
};

const ITEMS: Item[] = [
  { label: "Duplicate", icon: Copy, action: "duplicate" },
  { label: "New Worktree", icon: GitBranch, action: "worktree" },
  {
    label: "Edit Config",
    icon: Pencil,
    shortcut: "⌘E",
    inert: "Opens .lpm.yml in your editor",
  },
  {
    label: "Notes",
    icon: MessageSquare,
    shortcut: "⌘⇧N",
    inert: "Opens this project's notes in your editor",
  },
  { label: "Rename", icon: Pencil, inert: "Renaming is disabled in the demo" },
  { label: "Copy path", icon: Clipboard, action: "copy-path" },
];

const ITEM_CLASS =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/** The menu a project row opens on right-click or from its ⋮. Duplicate, New
 *  Worktree, Copy path and Remove all really run; the rest sit disabled saying
 *  why, since two of them open the visitor's own editor and Rename is simply
 *  out of scope here.
 *  No menu roles — the app's own context menu carries none either. */
export function SidebarRowMenu({
  x,
  y,
  label,
  root,
  onClose,
  onDuplicate,
  onRemove,
}: {
  x: number;
  y: number;
  label: string;
  root: string;
  onClose: () => void;
  onDuplicate: (mode: "duplicate" | "worktree") => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [copied, setCopied] = useState(false);

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
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(
        ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
      );
      if (items.length === 0) return;
      // The arrows walk the rows the way they do in the app. preventDefault is
      // load-bearing: unhandled, they scroll the page, and the scroll-close
      // below would take the menu down on the first keystroke.
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next =
        index === -1
          ? delta === 1
            ? 0
            : items.length - 1
          : (index + delta + items.length) % items.length;
      items[next].focus({ preventScroll: true });
    };
    // Coordinates captured on open: anything that moves the row strands it.
    // Only scrollers that hold the menu count — the terminal panes stream
    // output and scroll themselves constantly.
    const onScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (ref.current && target?.contains(ref.current)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // The row confirms in place before the menu goes, so the copy is visibly
  // something that happened rather than a click that closed a menu.
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(onClose, COPIED_MS);
    return () => window.clearTimeout(id);
  }, [copied, onClose]);

  const copyPath = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(root).catch(() => {});
    }
    setCopied(true);
  };

  return (
    <div
      ref={ref}
      aria-label={`Options for ${label}`}
      style={{ left: pos.left, top: pos.top }}
      className="menu-pop fixed z-[80] min-w-[180px] rounded-lg border border-[#2e2e2e] bg-[#1a1a1a] py-1 shadow-lg"
    >
      {ITEMS.map(({ label: item, icon: Icon, shortcut, action, inert }) => {
        const showCopied = action === "copy-path" && copied;
        return (
          <button
            key={item}
            type="button"
            data-tour={action ? `row-menu:${action}` : undefined}
            disabled={!!inert}
            title={inert}
            onClick={() => {
              if (action === "copy-path") {
                copyPath();
                return;
              }
              if (action) onDuplicate(action);
              onClose();
            }}
            className={`${ITEM_CLASS} ${FOCUS_RING} text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]`}
          >
            {showCopied ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-[#4ade80]" strokeWidth={2} />
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            )}
            <span className="min-w-0 flex-1 truncate">
              {showCopied ? "Path copied" : item}
            </span>
            {shortcut && <span className="shrink-0 text-[10px] text-[#8e8e8e]">{shortcut}</span>}
          </button>
        );
      })}
      <div className="my-1 h-px bg-[#2e2e2e]" />
      <button
        type="button"
        onClick={() => {
          onRemove();
          onClose();
        }}
        className={`${ITEM_CLASS} ${FOCUS_RING} text-[#f87171] hover:bg-[#2a2a2a]`}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate">Remove from lpm</span>
      </button>
    </div>
  );
}
