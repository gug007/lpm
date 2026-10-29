import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "../../hooks/useAnchoredPanel";
import { useAppStore } from "../../store/app";
import { useGlobalAgentStatus } from "../../store/globalAgentStatus";
import { busyAgentPlaces, busyTotal, type BusyAgentPlace } from "../../updateBusyAgents";

function waitHint(places: BusyAgentPlace[]): string {
  const agents = busyTotal(places);
  if (agents === 0) return "No agent is working, so it starts now";
  const noun = agents === 1 ? "agent" : "agents";
  const where = places.length === 1 ? places[0].name : `${places.length} projects`;
  return `Waits for ${agents} ${noun} in ${where}`;
}

const HALF = "bg-[var(--accent-green)] text-xs font-medium text-white transition-opacity hover:opacity-90";

// Update now, or once no agent is mid-turn — the choice `lpm update` makes.
export function UpdateSplitButton({ onNow, onWait }: { onNow: () => void; onWait: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLButtonElement, HTMLDivElement>({
    open,
    onClose: close,
    width: 248,
  });
  // Read only while the menu is open, so agents changing state don't redraw a
  // closed button.
  const projects = useAppStore((s) => (open ? s.projects : null));
  const entries = useGlobalAgentStatus((s) => (open ? s.entries : null));
  const waitText = projects && entries ? waitHint(busyAgentPlaces(projects, entries)) : "";

  const items = [
    { label: "Update now", hint: "Restarts lpm right away", run: onNow },
    { label: "When agents finish", hint: waitText, run: onWait },
  ];

  return (
    <>
      <div className="inline-flex">
        <button type="button" onClick={onNow} className={`rounded-l-md px-3 py-1.5 ${HALF}`}>
          Update
        </button>
        <button
          ref={triggerRef}
          type="button"
          aria-label="When to update"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`rounded-r-md border-l border-black/15 px-1.5 ${HALF}`}
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            role="menu"
            aria-label="When to update"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
            className="z-[70] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl"
          >
            {items.map((item, i) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                autoFocus={i === 0}
                onClick={() => {
                  close();
                  item.run();
                }}
                className="block w-full rounded-md px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)]"
              >
                <span className="block text-[13px] text-[var(--text-primary)]">{item.label}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">{item.hint}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
