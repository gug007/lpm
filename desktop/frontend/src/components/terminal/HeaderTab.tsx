import { type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Pin } from "lucide-react";
import { XIcon } from "../icons";
import { Tooltip } from "../ui/Tooltip";
import { useIsTruncated } from "../../hooks/useIsTruncated";
import { actionAccentColor, actionTextColor } from "../../actionColors";

export function HeaderTab({
  label,
  icon,
  active,
  onClick,
  onClose,
  onContextMenu,
  pinned,
  shimmer,
  done,
  waiting,
  error,
  color,
  trailing,
}: {
  label: string;
  icon?: ReactNode;
  active: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  onClose?: () => void;
  onContextMenu?: (e: MouseEvent<HTMLButtonElement>) => void;
  pinned?: boolean;
  shimmer?: boolean;
  done?: boolean;
  waiting?: boolean;
  error?: boolean;
  // Accent tint for the label (from the action that launched the tab). Status
  // colors (error/waiting/shimmer/done) take precedence while active.
  color?: string;
  trailing?: ReactNode;
}) {
  const closable = !!onClose && !pinned;
  const hasHoverIcon = closable || !!pinned;
  const { ref: labelRef, truncated } = useIsTruncated(label);

  const statusClassName = error
    ? "text-red-400"
    : waiting
    ? "sidebar-waiting"
    : shimmer
    ? "sidebar-shimmer"
    : "";
  const hasStatus = shimmer || waiting || error;
  const statusStyle =
    done && !hasStatus
      ? { color: "var(--accent-blue)" }
      : !done && !hasStatus && color
        ? { color: actionTextColor(color) }
        : undefined;

  // Tint the active pill (and inactive hover) with the launching action's
  // accent, gated exactly like the label above so status colors and done-blue
  // still win. Neutral fallbacks in the classes cover uncolored tabs.
  const accent =
    !done && !hasStatus && color ? actionAccentColor(color) : undefined;
  const accentStyle =
    accent !== undefined
      ? ({
          "--tab-accent-bg": `color-mix(in srgb, ${accent} 12%, var(--terminal-tab-active-bg))`,
          "--tab-accent-ring": `inset 0 0 0 1px color-mix(in srgb, ${accent} 30%, transparent), 0 1px 2px rgba(0,0,0,0.10)`,
          "--tab-accent-hover": `color-mix(in srgb, ${accent} 10%, transparent)`,
        } as CSSProperties)
      : undefined;

  const labelNode = (
    <span ref={labelRef} className={`min-w-0 truncate ${statusClassName}`} style={statusStyle}>
      {label}
    </span>
  );

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onAuxClick={(e) => {
        if (e.button === 1 && closable) {
          e.preventDefault();
          onClose!();
        }
      }}
      data-active-tab={active || undefined}
      style={accentStyle}
      className={`group flex h-6 max-w-[200px] select-none items-center gap-1.5 overflow-hidden rounded-md px-2 font-mono text-[11px] font-medium transition-colors duration-150 ${
        active
          ? "bg-[var(--tab-accent-bg,var(--terminal-tab-active-bg))] text-[var(--terminal-tab-active)] shadow-[var(--tab-accent-ring,var(--terminal-tab-shadow))]"
          : "text-[var(--terminal-header-text)] hover:bg-[var(--tab-accent-hover,var(--terminal-header-hover))] hover:text-[var(--terminal-tab-active)]"
      }`}
    >
      {icon && (
        <span className="flex shrink-0 items-center">
          <span
            className={`flex items-center transition-opacity ${active ? "opacity-90" : "opacity-60 group-hover:opacity-80"} [&>svg]:h-3.5 [&>svg]:w-3.5 ${hasHoverIcon ? "group-hover:hidden" : ""}`}
            style={statusStyle}
          >
            {icon}
          </span>
          {pinned ? (
            <Tooltip content="Pinned (right-click to unpin)" side="bottom" triggerClassName="hidden group-hover:inline-flex">
              <span className="flex items-center opacity-80 [&>svg]:h-3.5 [&>svg]:w-3.5">
                <Pin size={14} />
              </span>
            </Tooltip>
          ) : closable ? (
            <Tooltip content="Close (Cmd+W)" side="bottom" triggerClassName="hidden group-hover:inline-flex">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose!();
                }}
                className="flex items-center rounded opacity-70 transition-colors hover:text-[var(--accent-red)] hover:opacity-100 [&>svg]:h-3.5 [&>svg]:w-3.5"
              >
                <XIcon />
              </span>
            </Tooltip>
          ) : null}
        </span>
      )}
      {truncated ? (
        <Tooltip content={label} side="bottom" triggerClassName="flex min-w-0">
          {labelNode}
        </Tooltip>
      ) : (
        labelNode
      )}
      {trailing}
    </button>
  );
}
