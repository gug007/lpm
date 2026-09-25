import { AlarmClock } from "lucide-react";
import { AGENT, EMPTY_BODY, EMPTY_TITLE, PROJECT, PROMPT, type Sent, type Target } from "./reset-data";

const ACTION =
  "h-6 rounded-md px-2 text-[11px] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]";

const KBD =
  "rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1 py-px font-mono text-[10px] text-[var(--text-secondary)]";

type Props = {
  target: Target | null;
  sent: Sent | null;
  onSendNow: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onUndo: () => void;
};

export default function ResetScheduled({ target, sent, onSendNow, onEdit, onCancel, onUndo }: Props) {
  const [bodyStart, bodyEnd] = EMPTY_BODY.split("⌥↵");
  const pending = target !== null && sent === null;

  return (
    <div className="flex flex-col gap-2.5">
      {sent && (
        <p className="flex min-w-0 items-baseline gap-3 px-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-primary)]">{`› ${PROMPT}`}</span>
          <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{`sent ${sent.at}`}</span>
        </p>
      )}

      {!target && (
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-1.5 pl-3 pr-1.5">
          <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">Scheduled prompt canceled</p>
          <button
            type="button"
            data-focus="undo"
            onClick={onUndo}
            className={`${ACTION} shrink-0 font-medium text-[var(--accent-blue)]`}
          >
            Undo
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55)]">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--text-muted)]">History</p>
          <p className="flex h-[26px] items-center gap-1.5 rounded-lg bg-[var(--bg-active)] px-2.5 text-[11px] font-medium text-[var(--text-primary)]">
            <AlarmClock aria-hidden className="h-3 w-3" strokeWidth={1.75} />
            Scheduled
            {pending && <span className="text-[10px] tabular-nums opacity-60">1</span>}
          </p>
        </div>

        <div className="border-t border-[var(--border)] p-1.5">
          {sent || !target ? (
            <div className="flex flex-col items-center gap-2 px-6 py-6 text-center">
              <AlarmClock aria-hidden size={18} strokeWidth={1.5} className="text-[var(--text-muted)]" />
              <p className="text-[13px] font-medium text-[var(--text-secondary)]">{EMPTY_TITLE}</p>
              <p className="max-w-[340px] text-[12px] leading-relaxed text-[var(--text-muted)]">
                {bodyStart}
                <kbd className={KBD}>⌥↵</kbd>
                {bodyEnd}
              </p>
            </div>
          ) : (
            <>
              <p className="px-2.5 pb-0.5 pt-1 text-[10.5px] font-medium text-[var(--text-muted)]">{`${PROJECT} · ${AGENT}`}</p>
              <div className="flex flex-col gap-1 rounded-lg px-2.5 py-2">
                <p className="truncate text-[12.5px] text-[var(--text-primary)]">{PROMPT}</p>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="min-w-0 truncate text-[11px] tabular-nums text-[var(--accent-blue)]">
                    {`${target.when} · ${target.countdown}`}
                  </p>
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      data-focus="row"
                      onClick={onSendNow}
                      className={`${ACTION} font-medium text-[var(--accent-blue)]`}
                    >
                      Send now
                    </button>
                    <button type="button" onClick={onEdit} className={`${ACTION} text-[var(--text-secondary)]`}>
                      Edit
                    </button>
                    <button type="button" onClick={onCancel} className={`${ACTION} text-[var(--text-secondary)]`}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
