import { type KeepAwakeSession, useKeepAwakeLeft, useKeepAwakeSpan } from "../hooks/useKeepAwakeSession";
import { keepAwakeStatus, keepAwakeSummary } from "../keepAwake";
import { CoffeeIcon } from "./icons";
import { KeepAwakeStatusPill } from "./KeepAwakeStatusPill";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";

// The top of the Keep awake menu: a cup that steams only while the machine is
// held, the title, a status pill, and one short line of what holds it and
// until when. The rule under it drains while a countdown runs, so the header
// keeps one height whatever it says.
export function KeepAwakeStatusHeader({
  session,
  title,
  machine,
}: {
  session: KeepAwakeSession;
  title: string;
  machine: string;
}) {
  const { state, endsAt, error } = session;
  const left = useKeepAwakeLeft(endsAt);
  const total = useKeepAwakeSpan(endsAt);
  const status = state ? keepAwakeStatus(state) : null;
  const bar = state?.active && left !== null && total !== null ? Math.min(1, left / total) : null;
  const cupOn = status === "awake" || status === "waiting";

  return (
    <>
      <div className="px-3 pb-1.5 pt-1.5">
        <div className="flex items-center gap-[7px]">
          <span className={`flex ${cupOn ? "text-[var(--accent-amber-text)]" : "text-[var(--text-muted)]"}`}>
            <CoffeeIcon awake={status === "awake"} />
          </span>
          <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-primary)]">{title}</p>
          {status && <KeepAwakeStatusPill status={status} />}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)]" aria-live="polite">
          {state
            ? keepAwakeSummary(state, left, machine).map((run, i) =>
                typeof run === "string" ? (
                  run
                ) : (
                  <b key={i} className="font-semibold tabular-nums text-[var(--text-primary)]">
                    {run.strong}
                  </b>
                ),
              )
            : "Loading…"}
        </p>
        {error && <p className="mt-1 text-[11px] leading-snug text-[var(--accent-red-text)]">{error}</p>}
      </div>
      {state?.supported &&
        (bar === null ? (
          <ContextMenuSeparator />
        ) : (
          <div className="my-[3.5px] h-[2px] bg-[var(--border)]" aria-hidden>
            <div
              className="h-full bg-[var(--accent-amber)] transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
              style={{ width: `${bar * 100}%` }}
            />
          </div>
        ))}
    </>
  );
}
