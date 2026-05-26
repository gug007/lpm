import { type MouseEvent } from "react";
import { Pin } from "lucide-react";
import { XIcon } from "../icons";
import { Tooltip } from "../ui/Tooltip";

export function HeaderTab({
  label,
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
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--terminal-header-active)] text-[var(--terminal-tab-active)]"
          : "text-[var(--terminal-header-text)] hover:text-[var(--terminal-tab-active)]"
      }`}
    >
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
      {pinned ? (
        <Tooltip content="Pinned (right-click to unpin)" side="bottom">
          <span className="ml-0.5 p-0.5 opacity-80">
            <Pin size={12} />
          </span>
        </Tooltip>
      ) : (
        onClose && (
          <Tooltip content="Close (Cmd+W)" side="bottom">
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="ml-0.5 rounded p-0.5 opacity-60 hover:bg-[var(--terminal-header-hover)] hover:opacity-100"
            >
              <XIcon />
            </span>
          </Tooltip>
        )
      )}
    </button>
  );
}
