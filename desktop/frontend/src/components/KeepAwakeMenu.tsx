import { createPortal } from "react-dom";
import { type KeepAwakeSession, useKeepAwakeLeft } from "../hooks/useKeepAwakeSession";
import { keepAwakeLine, keepAwakePowerNote } from "../keepAwake";
import { isMac } from "../platform";
import { KeepAwakeModeRow } from "./KeepAwakeModeRow";
import { KeepAwakeOptions } from "./KeepAwakeOptions";
import { KeepAwakeTailChips } from "./KeepAwakeTailChips";
import { KeepAwakeTime } from "./KeepAwakeTime";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuShell } from "./ui/ContextMenuShell";

const LID_NOTE = isMac
  ? "Closing the lid still puts it to sleep, unless a display is connected."
  : "Closing a laptop's lid follows its power settings.";

type Place = { x: number; y: number; anchor?: undefined } | { anchor: HTMLElement; x?: undefined; y?: undefined };

// Keep a machine awake while agents work, for a set time, or until turned off.
export function KeepAwakeMenu({
  session,
  title,
  machine,
  place,
  align,
  trigger,
  onClose,
}: {
  session: KeepAwakeSession;
  title: string;
  /** How the notes name the machine: "this Mac", or a connected one's name. */
  machine: string;
  place: Place;
  align?: "start" | "end";
  trigger?: HTMLElement;
  onClose: () => void;
}) {
  const { state, endsAt, error, set, setPrefs } = session;
  const left = useKeepAwakeLeft(endsAt);
  const note = state ? keepAwakePowerNote(state, machine) : null;

  return createPortal(
    <ContextMenuShell {...place} align={align} trigger={trigger} minWidth={300} onClose={onClose}>
      <div className="w-[300px] pb-1">
        <div className="px-3 pb-2 pt-1.5">
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">{title}</p>
          {/* Two lines whatever it says, so switching modes doesn't move the rows. */}
          <p className="mt-0.5 min-h-[31px] text-[11px] leading-snug text-[var(--text-secondary)]" aria-live="polite">
            {state ? keepAwakeLine(state, left) : "Loading…"}
          </p>
          {note && <p className="mt-1 text-[11px] leading-snug text-[var(--accent-amber-text)]">{note}</p>}
          {error && <p className="mt-1 text-[11px] leading-snug text-[var(--accent-red-text)]">{error}</p>}
        </div>
        {state?.supported && (
          <>
            <ContextMenuSeparator />
            <div role="radiogroup" aria-label={title} className="flex flex-col gap-0.5">
              <KeepAwakeModeRow
                checked={state.mode === "off"}
                label="Off"
                detail="Sleeps on its usual schedule"
                onSelect={() => set("off")}
              />
              <KeepAwakeModeRow
                checked={state.mode === "agents"}
                label="While agents work"
                detail={state.mode === "agents" ? undefined : "Stays awake while any agent works"}
                onSelect={() => set("agents")}
              >
                {state.mode === "agents" && (
                  <KeepAwakeTailChips value={state.tailMinutes} onChange={(tailMinutes) => setPrefs({ tailMinutes })} />
                )}
              </KeepAwakeModeRow>
              <KeepAwakeModeRow checked={state.mode === "timed"} label="For a set time">
                <KeepAwakeTime onPick={(minutes) => set("timed", minutes)} />
              </KeepAwakeModeRow>
              <KeepAwakeModeRow
                checked={state.mode === "always"}
                label="Until I turn it off"
                detail="Also ends when you quit lpm"
                onSelect={() => set("always")}
              />
            </div>
            <ContextMenuSeparator />
            <KeepAwakeOptions state={state} onChange={setPrefs} />
            <p className="px-3 pt-0.5 text-[10.5px] leading-snug text-[var(--text-muted)]">{LID_NOTE}</p>
          </>
        )}
      </div>
    </ContextMenuShell>,
    document.body,
  );
}
