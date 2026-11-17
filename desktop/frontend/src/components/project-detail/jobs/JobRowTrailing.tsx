import { PencilIcon, RefreshIcon, StopIcon, TrashIcon } from "../../icons";
import { PlayIcon } from "../icons";
import { BTN_SECONDARY } from "../../ui/buttons";
import { StatusChip } from "../../ui/StatusChip";
import { Switch } from "../../ui/Switch";
import { HoverActionButton } from "./HoverActionButton";

export type JobRowAction = "answer" | "retry" | null;

interface JobRowTrailingProps {
  label: string;
  valid: boolean;
  enabled: boolean;
  running: boolean;
  // A question asked without a key holds every run until it's answered.
  held: boolean;
  removable: boolean;
  switchable: boolean;
  // What the row is waiting on the user for, as a button that stays put.
  action: JobRowAction;
  nextRun: string;
  onAnswer: () => void;
  onRunNow: () => void;
  onStop: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}

// The row's right-hand column: what the row waits on you for (Answer, Retry),
// only on the rows that wait, then two slots every row keeps at the same width
// so their edges line up down the list: when it runs next (or Manual), and its
// on/off switch. Hovering swaps the run time for the row's buttons.
export function JobRowTrailing({
  label,
  valid,
  enabled,
  running,
  held,
  removable,
  switchable,
  action,
  nextRun,
  onAnswer,
  onRunNow,
  onStop,
  onEdit,
  onRemove,
  onToggleEnabled,
}: JobRowTrailingProps) {
  return (
    <span className="flex shrink-0 items-center gap-3 self-center">
      {action !== null && (
        <button
          type="button"
          onClick={action === "answer" ? onAnswer : onRunNow}
          className={`${BTN_SECONDARY} flex items-center gap-1.5 whitespace-nowrap [&>svg]:h-3 [&>svg]:w-3`}
        >
          {action === "retry" && <RefreshIcon />}
          {action === "answer" ? "Answer" : "Retry"}
        </button>
      )}

      <span className="flex h-[30px] w-[156px] items-center justify-end">
        <span className="whitespace-nowrap text-[12px] group-focus-within:hidden group-hover:hidden">
          {nextRun ? (
            <>
              <span className="text-[var(--text-muted)]">Next run </span>
              <span className="font-medium tabular-nums text-[var(--text-secondary)]">{nextRun}</span>
            </>
          ) : (
            valid &&
            !switchable && (
              <span title="Runs only when you start it">
                <StatusChip>Manual</StatusChip>
              </span>
            )
          )}
        </span>
        <span className="hidden items-center gap-1 group-focus-within:flex group-hover:flex">
          {valid &&
            (running ? (
              <HoverActionButton label="Stop run" title="Stop" danger onClick={onStop}>
                <StopIcon />
              </HoverActionButton>
            ) : (
              enabled &&
              action !== "retry" && (
                <HoverActionButton
                  label="Run now"
                  title={held ? "Answer or skip its question first" : undefined}
                  disabled={held}
                  onClick={onRunNow}
                >
                  <PlayIcon />
                </HoverActionButton>
              )
            ))}
          <HoverActionButton label="Edit automation" title="Edit" onClick={onEdit}>
            <PencilIcon size={13} />
          </HoverActionButton>
          {removable && (
            <HoverActionButton label="Remove automation" title="Remove" danger onClick={onRemove}>
              <TrashIcon size={13} />
            </HoverActionButton>
          )}
        </span>
      </span>

      <span className="flex w-8 justify-end">
        {switchable && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={label}
            title={enabled ? "Turn off" : "Turn on"}
            onClick={() => onToggleEnabled(!enabled)}
            className="-m-1 flex rounded-full p-1"
          >
            <Switch checked={enabled} />
          </button>
        )}
      </span>
    </span>
  );
}
