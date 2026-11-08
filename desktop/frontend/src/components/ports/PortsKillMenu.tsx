import { useRef, useState } from "react";
import { MoreHorizontalIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { PORT_ACTION } from "./portsStyles";

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
        className={`${PORT_ACTION} flex items-center [&>svg]:h-3.5 [&>svg]:w-3.5`}
      >
        <MoreHorizontalIcon />
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
