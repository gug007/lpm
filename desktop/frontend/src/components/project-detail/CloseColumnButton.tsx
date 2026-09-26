import { X } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { NO_DRAG_STYLE } from "./constants";

export function CloseColumnButton({ onClose }: { onClose: () => void }) {
  return (
    <Tooltip content="Remove from side by side" side="bottom" align="end">
      <button
        type="button"
        onClick={onClose}
        aria-label="Remove from side by side"
        style={NO_DRAG_STYLE}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <X size={15} />
      </button>
    </Tooltip>
  );
}
