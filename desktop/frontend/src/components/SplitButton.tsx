import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import type { ActionInfo } from "../types";
import { ChevronDownIcon } from "./icons";
import { withEmoji } from "../withEmoji";
import { actionButtonStyle, actionTextColor } from "../actionColors";
import { useActionsDragActive } from "./ActionsDnd";
import { ActionMenu } from "./ActionMenu";
import { SPRING_LOAD_MS, useSpringOver } from "./springLoad";
import {
  PRIMARY_LAST_USED,
  loadRememberedChild,
  rememberChild,
  resolvePrimaryChild,
} from "./splitPrimary";

const SIZE_CLASSES = {
  default: {
    rounded: "rounded-lg",
    roundedL: "rounded-l-lg",
    roundedR: "rounded-r-lg",
    padding: "px-3.5 py-1.5 text-xs",
    chevronPad: "px-1.5",
    side: "below",
    border: "border border-[var(--border)]",
    dividerBorder: "border-l border-[var(--border)]",
    text: "text-[var(--text-secondary)]",
    hover: "hover:bg-[var(--terminal-header-active)] hover:text-[var(--text-primary)]",
    active: "bg-[var(--bg-active)] text-[var(--text-primary)]",
  },
  compact: {
    rounded: "rounded-md",
    roundedL: "rounded-l-md",
    roundedR: "rounded-r-md",
    padding: "px-2.5 py-1 text-[11px]",
    chevronPad: "px-1.5",
    side: "above",
    border: "border border-[var(--border)] bg-[var(--bg-secondary)]",
    dividerBorder: "border-l border-[var(--border)]",
    text: "text-[var(--text-secondary)]",
    hover: "hover:bg-[var(--terminal-header-active)] hover:text-[var(--text-primary)]",
    active: "bg-[var(--terminal-header-active)] text-[var(--text-primary)]",
  },
} as const;

const PANEL_WIDTH = 288;

interface SplitButtonProps {
  action: ActionInfo;
  disabled: boolean;
  onRunAction: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent) => void;
  compact?: boolean;
  scope?: string;
}

export function SplitButton({ action, disabled, onRunAction, onContextMenu, compact = false, scope = "global" }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const [remembered, setRemembered] = useState<string | null>(() => loadRememberedChild(scope, action.name));
  useEffect(() => {
    setRemembered(loadRememberedChild(scope, action.name));
  }, [scope, action.name]);
  const dragActive = useActionsDragActive();
  const springOver = useSpringOver();
  // Keep this menu open through a drag only if it was already open when the
  // drag started (so its items stay draggable), rather than popping every
  // menu open on any drag.
  const keepOpenRef = useRef(false);
  const prevDragActiveRef = useRef(false);
  // Set when a drag spring-opens this menu, so it closes again when the drag
  // ends rather than getting stuck open.
  const springOpenedRef = useRef(false);
  useEffect(() => {
    if (dragActive && !prevDragActiveRef.current) keepOpenRef.current = open;
    if (!dragActive && prevDragActiveRef.current && springOpenedRef.current) {
      springOpenedRef.current = false;
      setOpen(false);
    }
    prevDragActiveRef.current = dragActive;
  }, [dragActive, open]);

  // Dwelling a dragged item over this button opens its dropdown so the user can
  // move the item inside (spring-load), mirroring the breadcrumb spring-out.
  useEffect(() => {
    if (!dragActive || !springOver || keepOpenRef.current) return;
    const timer = setTimeout(() => {
      springOpenedRef.current = true;
      setOpen(true);
    }, SPRING_LOAD_MS);
    return () => clearTimeout(timer);
  }, [dragActive, springOver]);
  const panelOpen = open || (dragActive && keepOpenRef.current);
  const s = compact ? SIZE_CLASSES.compact : SIZE_CLASSES.default;
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open: panelOpen,
    onClose: () => setOpen(false),
    width: PANEL_WIDTH,
    side: s.side,
  });

  const primaryChild = resolvePrimaryChild(action, remembered);
  const isSplit = !!primaryChild || !!action.cmd;

  const noteRun = (child: ActionInfo) => {
    if (action.primary !== PRIMARY_LAST_USED) return;
    if (!child.name.startsWith(`${action.name}:`)) return;
    const rest = child.name.slice(action.name.length + 1);
    if (rest.includes(":")) return;
    rememberChild(scope, action.name, rest);
    setRemembered(rest);
  };

  const handleSelectChild = (child: ActionInfo) => {
    setOpen(false);
    noteRun(child);
    onRunAction(child);
  };

  const runPrimary = () => {
    if (primaryChild) {
      noteRun(primaryChild);
      onRunAction(primaryChild);
    } else {
      onRunAction(action);
    }
  };

  const dropdown = panelOpen && style && createPortal(
    <div ref={panelRef} style={style} className="z-[70]">
      <ActionMenu action={action} onRun={handleSelectChild} onClose={() => setOpen(false)} />
    </div>,
    document.body,
  );

  const primaryColor = primaryChild?.color || action.color;

  const trigger = isSplit ? (
    <div
      style={actionButtonStyle(action.color)}
      className={`inline-flex items-stretch ${s.rounded} ${s.border}`}
    >
      <button
        onClick={runPrimary}
        disabled={disabled}
        style={{ color: actionTextColor(primaryColor) }}
        className={`whitespace-nowrap ${s.roundedL} ${s.padding} font-medium ${s.text} transition-all duration-100 active:scale-[0.97] ${s.hover} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {primaryChild ? withEmoji(primaryChild.emoji, primaryChild.label) : withEmoji(action.emoji, action.label)}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`flex items-center ${s.roundedR} ${s.dividerBorder} ${s.chevronPad} transition-all duration-100 active:scale-[0.97] ${s.hover} disabled:cursor-not-allowed disabled:opacity-40 ${open ? s.active : s.text}`}
      >
        <ChevronDownIcon />
      </button>
    </div>
  ) : (
    <button
      onClick={() => setOpen((v) => !v)}
      disabled={disabled}
      style={actionButtonStyle(action.color)}
      className={`inline-flex items-center gap-1 whitespace-nowrap ${s.rounded} ${s.border} ${s.padding} font-medium ${s.text} transition-all duration-100 active:scale-[0.97] ${s.hover} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {withEmoji(action.emoji, action.label)}
      <ChevronDownIcon />
    </button>
  );

  return (
    <div ref={triggerRef} onContextMenu={onContextMenu} className="shrink-0 cursor-grab select-none">
      {trigger}
      {dropdown}
    </div>
  );
}
