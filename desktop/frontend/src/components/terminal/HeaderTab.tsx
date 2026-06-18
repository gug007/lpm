import { type MouseEvent, type ReactNode } from "react";
import { Pin } from "lucide-react";
import { XIcon } from "../icons";
import { Tooltip } from "../ui/Tooltip";
import { useIsTruncated } from "../../hooks/useIsTruncated";

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
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
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
  const { ref: labelRef, truncated } = useIsTruncated(label);

  const statusClassName = error
    ? "text-red-400"
    : waiting
    ? "sidebar-waiting"
    : shimmer
    ? "sidebar-shimmer"
    : "";
  const statusStyle =
    done && !shimmer && !waiting && !error ? { color: "var(--accent-blue)" } : undefined;

  const labelNode = (
    <span ref={labelRef} className={`min-w-0 truncate ${statusClassName}`} style={statusStyle}>
      {label}
    </span>
  );

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      data-active-tab={active || undefined}
      className={`group flex max-w-[200px] select-none items-center gap-1 overflow-hidden rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
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
      {truncated ? (
        <Tooltip content={label} side="bottom" triggerClassName="flex min-w-0">
          {labelNode}
        </Tooltip>
      ) : (
        labelNode
      )}
    </button>
  );
}
