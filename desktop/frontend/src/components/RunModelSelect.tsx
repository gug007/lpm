import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Cpu } from "lucide-react";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { AI_CLI_OPTIONS, aiEffectiveEffort, aiEfforts } from "../types";
import { pickSummary, type ModelPick, type SwitchableCLI } from "../agentModelSwitch";

interface RunModelSelectProps {
  cli: SwitchableCLI;
  value: ModelPick;
  onChange: (pick: ModelPick) => void;
}

const PANEL_WIDTH = 300;

// What a run's pick reads as: an empty model keeps what run #1 launches with.
function runModelSummary(cli: SwitchableCLI, pick: ModelPick): string {
  return [pick.model ? "" : "Same model", pickSummary(cli, pick)].filter(Boolean).join(" · ");
}

// The model and reasoning level one run launches its agent with.
export function RunModelSelect({ cli, value, onChange }: RunModelSelectProps) {
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLButtonElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width: PANEL_WIDTH,
  });

  const models = AI_CLI_OPTIONS.find((o) => o.value === cli)?.models ?? [];
  const levels = aiEfforts(cli, value.model);
  const pinned = Boolean(value.model || value.effort);

  const pickModel = (model: string) =>
    onChange({ model, effort: aiEffectiveEffort(cli, model, value.effort) });

  const column = (
    title: string,
    rows: { value: string; label: string }[],
    current: string,
    pick: (v: string) => void,
  ) => (
    <div className="min-w-0 flex-1">
      <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-[var(--text-muted)]">{title}</div>
      {rows.map((row) => {
        const active = row.value === current;
        return (
          <button
            key={row.value || "same"}
            type="button"
            onClick={() => pick(row.value)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              active
                ? "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{row.value ? row.label : "Same"}</span>
            {active && <Check size={14} className="shrink-0" />}
          </button>
        );
      })}
    </div>
  );

  const panel =
    open &&
    style &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        className="z-[70] flex max-h-80 gap-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl"
      >
        {column("Model", models, value.model, pickModel)}
        {levels.length > 0 &&
          column("Level", levels, value.effort, (effort) => onChange({ ...value, effort }))}
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Model and level this run starts with"
        className={`flex h-9 w-[10.5rem] shrink-0 items-center gap-1.5 rounded-lg border bg-[var(--bg-secondary)] pl-2.5 pr-2 text-[12px] font-medium transition-colors ${
          open
            ? "border-[var(--accent-cyan)]/50 text-[var(--text-primary)]"
            : pinned
              ? "border-[var(--border)] text-[var(--accent-cyan)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Cpu size={13} className="shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate text-left">{runModelSummary(cli, value)}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {panel}
    </>
  );
}
