import { EventsOn } from "../../../bridge/runtime";
import { interactivePaneOutputAt } from "../../components/InteractivePane";
import { useAppStore } from "../../store/app";
import { STATUS_RUNNING } from "../../types";

const BACK_WAIT_MS = 6000;
const SETTLED_MS = 250;
// A Claude that drew before saying it started has nothing more to draw.
const DREW_FIRST_MS = 1500;
const POLL_MS = 50;

function working(projectName: string, terminalId: string): boolean {
  return (
    useAppStore
      .getState()
      .projects.find((p) => p.name === projectName)
      ?.statusEntries.some((e) => e.paneID === terminalId && e.value === STATUS_RUNNING) ?? false
  );
}

function settledSince(terminalId: string, since: number, now: number): boolean {
  const drewAt = interactivePaneOutputAt(terminalId);
  const quiet = drewAt > 0 && now - drewAt >= SETTLED_MS;
  return quiet && (drewAt > since || now - since >= DREW_FIRST_MS);
}

// What shows Claude is back: settled at its prompt, working again on a turn it
// carries on, or either, for a tab whose move another machine ran.
export type ClaudeBackSign = "settled" | "working" | "either";

// Resolves once Claude shows again in a tab moved to another account: started
// there (its SessionStart report) and then `sign`. Gives up after BACK_WAIT_MS
// where nothing reports. Call before the command is typed, so the start can't
// be missed.
export function whenClaudeBack(projectName: string, terminalId: string, sign: ClaudeBackSign): Promise<void> {
  return new Promise((resolve) => {
    const deadline = performance.now() + BACK_WAIT_MS;
    let startedAt: number | null = null;
    const off = EventsOn("agent-session", (payload: { paneId?: string } | null) => {
      if (payload?.paneId === terminalId) startedAt ??= performance.now();
    });
    const back = (now: number) =>
      startedAt !== null &&
      ((sign !== "settled" && working(projectName, terminalId)) ||
        (sign !== "working" && settledSince(terminalId, startedAt, now)));
    const tick = () => {
      const now = performance.now();
      if (back(now) || now >= deadline) {
        off();
        resolve();
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
  });
}
