import { create } from "zustand";
import { QuitApp } from "../bridge/commands";
import { toast } from "./notifications/toast";
import { useAppStore } from "./store/app";
import { useGlobalAgentStatus } from "./store/globalAgentStatus";
import { busyAgentPlaces, busyTotal, type BusyAgentPlace } from "./updateBusyAgents";

const WAITING_TOAST_ID = "quit-when-agents-finish";

interface QuitGuardState {
  /** Where agents are mid-task, while the dialog asks whether to end them. */
  asking: BusyAgentPlace[] | null;
  /** The user chose to quit once the last of them is done. */
  waiting: boolean;
}

export const useQuitGuard = create<QuitGuardState>(() => ({ asking: null, waiting: false }));

export function busyPlacesNow(): BusyAgentPlace[] {
  return busyAgentPlaces(useAppStore.getState().projects, useGlobalAgentStatus.getState().entries);
}

export function waitingText(places: BusyAgentPlace[]): string {
  const total = busyTotal(places);
  return total === 1 ? "lpm quits when the agent finishes" : `lpm quits when ${total} agents finish`;
}

function quit(): void {
  QuitApp().catch((err: unknown) => toast.error(String(err)));
}

/** Quit, unless agents are mid-task: quitting would end them, so ask first.
 *  Asked again while asking, quit at once. */
export function requestQuit(): void {
  if (useQuitGuard.getState().asking) return quitNow();
  const places = busyPlacesNow();
  if (places.length === 0) quit();
  else useQuitGuard.setState({ asking: places });
}

export function quitNow(): void {
  toast.dismiss(WAITING_TOAST_ID);
  useQuitGuard.setState({ asking: null, waiting: false });
  quit();
}

export function cancelQuit(): void {
  useQuitGuard.setState({ asking: null });
}

export function quitWhenAgentsFinish(): void {
  useQuitGuard.setState({ asking: null, waiting: true });
  showWaiting(busyPlacesNow());
}

export function stopWaitingToQuit(): void {
  toast.dismiss(WAITING_TOAST_ID);
  useQuitGuard.setState({ waiting: false });
}

/** While waiting: quit once nothing is mid-task, else keep the count current. */
export function checkWaitingToQuit(): void {
  if (!useQuitGuard.getState().waiting) return;
  const places = busyPlacesNow();
  if (places.length === 0) quitNow();
  else showWaiting(places);
}

function showWaiting(places: BusyAgentPlace[]): void {
  const asking = places.some((place) => place.asking > 0);
  toast.loading(waitingText(places), {
    id: WAITING_TOAST_ID,
    duration: Infinity,
    description: asking ? "An agent is waiting for your answer." : undefined,
    action: { label: "Quit now", onClick: quitNow },
    cancel: { label: "Don't quit", onClick: stopWaitingToQuit },
  });
}
