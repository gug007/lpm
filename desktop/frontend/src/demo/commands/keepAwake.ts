import type { CommandMap } from "../backend";
import { emitEvent } from "../ipc";
import { KEEP_AWAKE_CHANGED, type KeepAwakeChoice, type KeepAwakeMode, type KeepAwakePrefs } from "../../keepAwake";
import { projects } from "./state";

// The sample Mac starts kept awake while its agents work, with one at it once
// a project is added; a fresh install has none, so it waits for one. It's a
// laptop with nothing plugged in, so its lid would put it to sleep.
let mode: KeepAwakeMode = "agents";
let endsAt: number | null = null;
let prefs: Required<KeepAwakePrefs> = { tailMinutes: 5, screen: true, battery: true, floor: 20 };
const agentsAtWork = () => (projects.size > 0 ? 1 : 0);

function state() {
  if (endsAt !== null && endsAt <= Date.now()) {
    mode = "off";
    endsAt = null;
  }
  const agents = mode === "agents" ? agentsAtWork() : 0;
  const active = mode === "agents" ? agents > 0 : mode !== "off";
  return {
    supported: true,
    screenSupported: true,
    mode,
    active,
    agents,
    endsIn: endsAt === null ? null : endsAt - Date.now(),
    ...prefs,
    power: active ? "awake" : "idle",
  };
}

function changed() {
  const next = state();
  emitEvent(KEEP_AWAKE_CHANGED, next);
  return next;
}

export const keepAwakeCommands: CommandMap = {
  keep_awake_state: () => state(),
  keep_awake_set: ({ mode: next, minutes }) => {
    const choice = next as KeepAwakeChoice;
    const ms = Number(minutes ?? 60) * 60_000;
    if (choice === "extend") {
      if (endsAt === null) throw new Error("Keep awake isn't counting down, so there's no time to add to.");
      endsAt = Math.max(endsAt, Date.now()) + ms;
      return changed();
    }
    mode = choice;
    endsAt = mode === "timed" ? Date.now() + ms : null;
    return changed();
  },
  keep_awake_set_prefs: ({ prefs: patch }) => {
    prefs = { ...prefs, ...(patch as KeepAwakePrefs) };
    return changed();
  },
  keep_awake_lid: () => ({ lid: "sleeps", onPower: false }),
};
