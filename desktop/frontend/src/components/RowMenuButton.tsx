import { MoreVerticalIcon } from "./icons";

interface RowMenuButtonProps {
  open: boolean;
  label: string;
  // Where it sits on the row's vertical axis, e.g. `top-1/2`.
  placement: string;
  onOpen: (x: number, y: number) => void;
}

/** A project row's ⋮, shown on hover and while its menu is open. */
export function RowMenuButton({ open, label, placement, onOpen }: RowMenuButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        // useOutsideClick's mousedown already closed the menu — skip the reopen so the second click toggles off.
        if (open) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onOpen(rect.left, rect.bottom + 4);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute right-1.5 ${placement} flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
        open ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
      }`}
      title="More options"
      aria-label={`More options for ${label}`}
    >
      <MoreVerticalIcon />
    </button>
  );
}
