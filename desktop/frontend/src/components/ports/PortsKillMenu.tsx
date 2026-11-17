import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { FOCUS } from "./portsStyles";

interface PortsKillMenuProps {
  holder: string;
  onKill: () => void;
}

// Kill for a port it would usually be a mistake to free that way.
export function PortsKillMenu({ holder, onKill }: PortsKillMenuProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`More actions for ${holder}`}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={`flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${FOCUS}`}
      >
        <MoreHorizontal size={16} strokeWidth={2.5} />
      </button>
      {open && button.current && (
        <ContextMenuShell anchor={button.current} trigger={button.current} align="end" onClose={() => setOpen(false)}>
          <ContextMenuItem
            label="Kill…"
            destructive
            onClick={() => {
              setOpen(false);
              onKill();
            }}
          />
        </ContextMenuShell>
      )}
    </>
  );
}
