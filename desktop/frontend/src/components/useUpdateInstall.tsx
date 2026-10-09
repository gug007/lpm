import { useEffect, useState, type ReactNode } from "react";
import { CancelUpdate, InstallUpdate } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { useAppStore } from "../store/app";
import { useGlobalAgentStatus } from "../store/globalAgentStatus";
import {
  useUpdateInstallState,
  type UpdateInstallState,
  type UpdatePhase,
} from "../store/updateInstall";
import { busyAgentPlaces, type BusyAgentPlace } from "../updateBusyAgents";
import { UpdateBusyAgentsDialog } from "./UpdateBusyAgentsDialog";

function isUpdatePhase(value: string): value is UpdatePhase {
  return value === "checking" || value === "downloading" || value === "installing";
}

const setInstall = (patch: Partial<UpdateInstallState>) => useUpdateInstallState.setState(patch);

async function install() {
  setInstall({ active: true, phase: "checking", progress: -1, cancelling: false, error: "" });
  try {
    // Resolves only when cancelled; a finished install restarts the app.
    await InstallUpdate();
  } catch (err) {
    setInstall({ error: String(err) });
  } finally {
    setInstall({ active: false, cancelling: false });
  }
}

async function cancel() {
  setInstall({ cancelling: true });
  const stopping = await CancelUpdate().catch(() => false);
  if (!stopping) setInstall({ cancelling: false });
}

export interface UpdateInstall extends UpdateInstallState {
  request: () => void;
  cancel: () => void;
  dismissError: () => void;
  dialogs: ReactNode;
}

/** Installing an update in place: a warning first when agents are mid-task,
 *  then progress the caller shows, which can cancel until the app starts being
 *  replaced. `dialogs` renders the warning; mount it once beside the caller's
 *  other modals. */
export function useUpdateInstall(): UpdateInstall {
  const state = useUpdateInstallState();
  const [busy, setBusy] = useState<BusyAgentPlace[] | null>(null);

  useEffect(() => EventsOn("update-progress", (pct: number) => setInstall({ progress: pct })), []);
  useEffect(
    () =>
      EventsOn("update-status", (status: string) => {
        if (isUpdatePhase(status)) setInstall({ phase: status });
      }),
    [],
  );

  const request = () => {
    const places = busyAgentPlaces(
      useAppStore.getState().projects,
      useGlobalAgentStatus.getState().entries,
    );
    if (places.length > 0) setBusy(places);
    else void install();
  };

  const dialogs: ReactNode = (
    <UpdateBusyAgentsDialog
      places={busy}
      onCancel={() => setBusy(null)}
      onConfirm={() => {
        setBusy(null);
        void install();
      }}
    />
  );

  return {
    ...state,
    request,
    cancel: () => void cancel(),
    dismissError: () => setInstall({ error: "" }),
    dialogs,
  };
}
