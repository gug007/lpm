import { GripVerticalIcon, MousePointerClickIcon, PlusIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";

const TOOLTIP_DELAY_MS = 500;

interface AddActionButtonProps {
  onAddAction: () => void;
}

export function AddActionButton({ onAddAction }: AddActionButtonProps) {
  return (
    <div className="shrink-0">
      <Tooltip
        content={
          <span className="flex w-[248px] flex-col leading-snug">
            <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">Create action</span>
            <span className="mt-1 text-[11.5px] text-[var(--text-muted)]">Add a button that runs a command or an AI agent.</span>
            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5">
                <GripVerticalIcon size={12} />
                Drag to move
              </span>
              <span className="flex items-center gap-1.5">
                <MousePointerClickIcon size={12} />
                Right-click for options
              </span>
            </span>
          </span>
        }
        side="bottom"
        wide
        delay={TOOLTIP_DELAY_MS}
      >
        <button
          type="button"
          onClick={onAddAction}
          aria-label="Create action"
          className="magic-ring group h-8 shrink-0 rounded-lg p-[1px] transition-all duration-150 active:scale-[0.97]"
        >
          <span className="flex h-full items-center gap-1 rounded-[calc(0.5rem-1px)] bg-[var(--bg-primary)] px-2.5 text-xs font-medium transition-colors duration-150 group-hover:bg-[color-mix(in_srgb,#a855f7_5%,var(--bg-primary))]">
            <span className="text-[color-mix(in_srgb,#a855f7_60%,var(--text-muted))]">
              <PlusIcon />
            </span>
            <span className="text-[var(--text-secondary)] transition-colors duration-150 group-hover:text-[var(--text-primary)]">Action</span>
          </span>
        </button>
      </Tooltip>
    </div>
  );
}
