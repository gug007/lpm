import { type MouseEvent, type ReactNode } from "react";
import { Pin } from "lucide-react";
import { XIcon } from "../icons";
import { Tooltip } from "../ui/Tooltip";

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
}: {
  label: string;
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
  onClose?: () => void;
  onContextMenu?: (e: MouseEvent<HTMLButtonElement>) => void;
  pinned?: boolean;
  shimmer?: boolean;
  done?: boolean;
  waiting?: boolean;
  error?: boolean;
}) {
  const closable = !!onClose && !pinned;
  const hasHoverIcon = closable || !!pinned;
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--terminal-header-active)] text-[var(--terminal-tab-active)]"
          : "text-[var(--terminal-header-text)] hover:text-[var(--terminal-tab-active)]"
      }`}
    >
      {icon && (
        <span className="flex shrink-0 items-center">
          <span
            className={`flex items-center opacity-80 [&>svg]:h-3.5 [&>svg]:w-3.5 ${hasHoverIcon ? "group-hover:hidden" : ""}`}
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
      <span
        className={
          error
            ? "text-red-400"
            : waiting
            ? "sidebar-waiting"
            : shimmer
            ? "sidebar-shimmer"
            : ""
        }
        style={
          done && !shimmer && !waiting && !error
            ? { color: "var(--accent-blue)" }
            : undefined
        }
      >
        {label}
      </span>
    </button>
  );
}
