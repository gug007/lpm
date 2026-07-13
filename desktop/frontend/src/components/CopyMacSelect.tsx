import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, MonitorSmartphone } from "lucide-react";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";

export interface CopyTargetOption {
  name: string;
  label: string;
}

interface CopyMacSelectProps {
  options: CopyTargetOption[];
  value: string;
  onChange: (name: string) => void;
}

const PANEL_WIDTH = 240;

export function CopyMacSelect({ options, value, onChange }: CopyMacSelectProps) {
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<
    HTMLButtonElement,
    HTMLDivElement
  >({ open, onClose: () => setOpen(false), width: PANEL_WIDTH });

  const selected = options.find((o) => o.name === value) ?? options[0];

  const menu =
    open &&
    style &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        className="z-[70] max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl"
      >
        {options.map((o) => {
          const active = o.name === selected?.name;
          return (
            <button
              key={o.name}
              type="button"
              onClick={() => {
                onChange(o.name);
                setOpen(false);
              }}
              title={o.label}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                active
                  ? "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              <MonitorSmartphone
                size={14}
                className={`shrink-0 ${active ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)]"}`}
              />
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {active && <Check size={14} className="shrink-0" />}
            </button>
          );
        })}
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Which Mac this copy is created on"
        className={`flex h-9 w-[7.5rem] shrink-0 items-center gap-1.5 rounded-lg border bg-[var(--bg-secondary)] pl-2.5 pr-2 text-[12px] font-medium transition-colors ${
          open
            ? "border-[var(--accent-cyan)]/50 text-[var(--text-primary)]"
            : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected?.label ?? ""}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {menu}
    </>
  );
}
