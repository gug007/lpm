import type { KeepAwakeSession } from "../hooks/useKeepAwakeSession";
import { KeepAwakeLidNote } from "./KeepAwakeLidNote";
import { KeepAwakeModeRow } from "./KeepAwakeModeRow";
import { KeepAwakeOptions } from "./KeepAwakeOptions";
import { KeepAwakeStatusHeader } from "./KeepAwakeStatusHeader";
import { KeepAwakeTailChips } from "./KeepAwakeTailChips";
import { KeepAwakeTime } from "./KeepAwakeTime";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";

// What Keep awake offers, whether it pops up on its own or opens beside its row
// in the More menu.
export function KeepAwakePanel({
  session,
  title,
  machine,
  slug = null,
}: {
  session: KeepAwakeSession;
  title: string;
  /** How the notes name the machine: "this Mac", or a connected one's name. */
  machine: string;
  /** The connected computer it controls; null for this one. */
  slug?: string | null;
}) {
  const { state, endsAt, set, extend, setPrefs } = session;

  return (
    <div className="w-[300px] pb-1">
      <KeepAwakeStatusHeader session={session} title={title} machine={machine} />
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
              <KeepAwakeTime
                endsAt={state.mode === "timed" ? endsAt : null}
                onPick={(minutes) => set("timed", minutes)}
                onExtend={extend}
              />
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
          <KeepAwakeLidNote slug={slug} on={state.mode !== "off"} />
        </>
      )}
    </div>
  );
}
