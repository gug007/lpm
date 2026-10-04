import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import type { ActionInfo } from "../types";
import { ChevronDownIcon } from "./icons";
import { withEmoji } from "../withEmoji";
import { actionButtonStyle, actionTextColor } from "../actionColors";
import { isChildId } from "../actionIds";
import { useActionsActiveId } from "./ActionsDnd";
import { ActionMenu } from "./ActionMenu";
import { SPRING_LOAD_MS, useSpringOver } from "./springLoad";
import {
  PRIMARY_LAST_USED,
  loadRememberedChild,
  rememberChild,
  resolvePrimaryChild,
} from "./splitPrimary";

// A row's palette, and which way its dropdowns open.
const TONE = {
  header: {
    side: "below",
    border: "border border-[var(--border)] bg-[var(--action-tint,var(--bg-secondary))]",
    dividerBorder: "border-l border-[var(--action-border,var(--border))]",
    text: "text-[var(--action-text,var(--text-secondary))]",
    hover: "hover:bg-[var(--action-tint-strong,var(--terminal-header-active))] hover:text-[var(--action-text,var(--text-primary))]",
    active: "bg-[var(--action-tint-strong,var(--bg-active))] text-[var(--action-text,var(--text-primary))]",
  },
  footer: {
    side: "above",
    border: "border border-[var(--composer-border)] bg-[var(--action-tint,var(--composer-surface))]",
    dividerBorder: "border-l border-[var(--action-border,var(--composer-border))]",
    text: "text-[var(--action-text,var(--composer-fg-secondary))]",
    hover: "hover:bg-[var(--action-tint-strong,var(--terminal-header-active))] hover:text-[var(--action-text,var(--composer-fg))]",
    active: "bg-[var(--action-tint-strong,var(--terminal-header-active))] text-[var(--action-text,var(--composer-fg))]",
  },
} as const;

const ROW_FIT = { wrapper: "shrink-0", fill: "", primaryFill: "" } as const;

// A zone's buttons fill their grid cell.
const ZONE_FIT = {
  height: "h-full",
  rounded: "rounded-md",
  roundedL: "rounded-l-md",
  roundedR: "rounded-r-md",
  padding: "px-2.5 text-[11px]",
  chevronPad: "px-1",
  wrapper: "flex h-full w-full",
  fill: "w-full justify-center",
  primaryFill: "flex-1 justify-center",
} as const;

const SIZE_CLASSES = {
  default: {
    ...TONE.header,
    ...ROW_FIT,
    height: "h-8",
    rounded: "rounded-lg",
    roundedL: "rounded-l-lg",
    roundedR: "rounded-r-lg",
    padding: "px-3.5 text-xs",
    chevronPad: "px-1.5",
  },
  compact: {
    ...TONE.footer,
    ...ROW_FIT,
    height: "",
    rounded: "rounded-md",
    roundedL: "rounded-l-md",
    roundedR: "rounded-r-md",
    padding: "px-2.5 py-1 text-[11px]",
    chevronPad: "px-1.5",
  },
  zone: { ...TONE.header, ...ZONE_FIT },
  footerZone: { ...TONE.footer, ...ZONE_FIT },
} as const;

export type ActionSize = keyof typeof SIZE_CLASSES;

// Footer buttons open their dropdowns upward, the rest downward.
export function splitPanelSide(size: ActionSize): "above" | "below" {
  return SIZE_CLASSES[size].side;
}

const PANEL_WIDTH = 288;

interface SplitButtonProps {
  action: ActionInfo;
  disabled: boolean;
  onRunAction: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent) => void;
  size?: ActionSize;
  scope?: string;
}

export function SplitButton({ action, disabled, onRunAction, onContextMenu, size = "default", scope = "global" }: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const [remembered, setRemembered] = useState<string | null>(() => loadRememberedChild(scope, action.name));
  useEffect(() => {
    setRemembered(loadRememberedChild(scope, action.name));
  }, [scope, action.name]);
  const activeId = useActionsActiveId();
  const dragActive = activeId !== null;
  // Only menu items can be dropped into a menu's rows.
  const childDrag = activeId !== null && isChildId(activeId);
  const springOver = useSpringOver();
  // Keep this menu open through a drag only if it was open when one of its
  // own items was picked up, so its rows stay where the item came from. Any
  // other drag closes it: its rows would cover the buttons beneath and take
  // no drop.
  const keepOpenRef = useRef(false);
  const prevDragActiveRef = useRef(false);
  // Set when a drag spring-opens this menu, so it closes again when the drag
  // ends rather than getting stuck open.
  const springOpenedRef = useRef(false);
  useEffect(() => {
    if (dragActive && !prevDragActiveRef.current) {
      keepOpenRef.current = open && activeId.startsWith(`${action.name}:`);
      if (open && !keepOpenRef.current) setOpen(false);
    }
    if (!dragActive && prevDragActiveRef.current && springOpenedRef.current) {
      springOpenedRef.current = false;
      setOpen(false);
    }
    prevDragActiveRef.current = dragActive;
  }, [dragActive, open, activeId, action.name]);

  // Resting a dragged menu item on this button opens its dropdown so the user
  // can place the item inside (spring-load), mirroring the breadcrumb spring-out.
  useEffect(() => {
    if (!childDrag || !springOver || keepOpenRef.current) return;
    const timer = setTimeout(() => {
      springOpenedRef.current = true;
      setOpen(true);
    }, SPRING_LOAD_MS);
    return () => clearTimeout(timer);
  }, [childDrag, springOver]);
  const panelOpen = open || (dragActive && keepOpenRef.current);
  const s = SIZE_CLASSES[size];
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

  // Children without a color of their own launch with the group's accent, so a
  // tab spawned from a colored split button keeps the tint the button shows.
  const runChild = (child: ActionInfo) => {
    noteRun(child);
    onRunAction(child.color || !action.color ? child : { ...child, color: action.color });
  };

  const handleSelectChild = (child: ActionInfo) => {
    setOpen(false);
    runChild(child);
  };

  const runPrimary = () => {
    if (primaryChild) {
      runChild(primaryChild);
    } else {
      onRunAction(action);
    }
  };

  const dropdown = panelOpen && style && createPortal(
    <div ref={panelRef} style={style} data-actions-menu="" className="z-[70]">
      <ActionMenu action={action} onRun={handleSelectChild} onClose={() => setOpen(false)} />
    </div>,
    document.body,
  );

  const primaryColor = primaryChild?.color || action.color;

  const trigger = isSplit ? (
    <div
      style={actionButtonStyle(action.color)}
      className={`inline-flex items-stretch ${s.height} ${s.rounded} ${s.border} ${s.fill}`}
    >
      <button
        onClick={runPrimary}
        disabled={disabled}
        style={{ color: actionTextColor(primaryColor) }}
        className={`flex items-center whitespace-nowrap ${s.primaryFill} ${s.roundedL} ${s.padding} font-medium ${s.text} transition-all duration-100 active:scale-[0.97] ${s.hover} disabled:cursor-not-allowed disabled:opacity-40`}
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
      className={`inline-flex items-center gap-1 whitespace-nowrap ${s.fill} ${s.height} ${s.rounded} ${s.border} ${s.padding} font-medium ${s.text} transition-all duration-100 active:scale-[0.97] ${s.hover} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {withEmoji(action.emoji, action.label)}
      <ChevronDownIcon />
    </button>
  );

  return (
    <div ref={triggerRef} onContextMenu={onContextMenu} className={`${s.wrapper} cursor-grab select-none`}>
      {trigger}
      {dropdown}
    </div>
  );
}
