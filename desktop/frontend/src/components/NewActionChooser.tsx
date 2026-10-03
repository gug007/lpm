import type { ZoneRows } from "../types";
import { PlusIcon } from "./icons";
import { ZONE_ROW_CHOICES, zoneRowsLabel } from "./zoneGeometry";

interface NewActionChooserProps {
  onAction: () => void;
  onZone: (rows: ZoneRows) => void;
}

export function NewActionChooser({ onAction, onZone }: NewActionChooserProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-1.5 shadow-2xl">
      <button
        type="button"
        autoFocus
        onClick={onAction}
        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-[var(--bg-hover)]"
      >
        <span className="text-[var(--text-muted)]">
          <PlusIcon />
        </span>
        <span className="flex flex-col">
          <span className="text-[12.5px] font-medium text-[var(--text-primary)]">Action</span>
          <span className="text-[11.5px] text-[var(--text-muted)]">A button that runs a command or an agent</span>
        </span>
      </button>
      <div className="my-1 h-px bg-[var(--border)]" />
      <div className="px-2.5 pb-1 pt-1.5">
        <div className="text-[12.5px] font-medium text-[var(--text-primary)]">Zone</div>
        <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">A framed spot for buttons. How tall?</div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {ZONE_ROW_CHOICES.map((rows) => (
            <button
              key={rows}
              type="button"
              onClick={() => onZone(rows)}
              aria-label={`New zone, ${zoneRowsLabel(rows)}`}
              className="h-7 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              {zoneRowsLabel(rows)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
