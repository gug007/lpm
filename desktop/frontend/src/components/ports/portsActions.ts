import { FocusMainWindow, KillPortHolder } from "../../../bridge/commands";
import { IS_MIRROR_WINDOW } from "../../mirror";
import { toast } from "../../notifications/toast";
import { copyPortUrlOn, copyProjectPortUrl, openPortOn } from "../../peer/projectPorts";
import { openPortInLpm } from "../../portLinks";
import { portProtocol } from "../../portProtocols";
import { useAppStore } from "../../store/app";
import { useListeningPorts } from "../../store/listeningPorts";
import { LOCAL_MACHINE, type ListeningPort } from "./portsModel";

const machineSlug = (p: ListeningPort) => (p.machine === LOCAL_MACHINE ? null : p.machine);

// A project's server opens in that project's Browser tab; anything else in the
// default browser, since it belongs to no project.
export async function openPort(p: ListeningPort): Promise<void> {
  if (p.project) {
    openPortInLpm(p.project, p.port, p.service ? { label: `${p.service} :${p.port}` } : {});
    return;
  }
  await openPortOn(machineSlug(p), p.port);
}

export async function copyPortUrl(p: ListeningPort): Promise<void> {
  const scheme = portProtocol(p.port, p.process)?.scheme;
  if (p.project) {
    await copyProjectPortUrl(p.project, p.port, scheme);
    return;
  }
  await copyPortUrlOn(machineSlug(p), p.port, scheme);
}

export async function stopPortService(p: ListeningPort): Promise<void> {
  await useAppStore.getState().stopService(p.project, p.service);
  await useListeningPorts.getState().load();
}

export async function killPortHolder(p: ListeningPort): Promise<void> {
  try {
    await KillPortHolder(p.machine, p.pid, p.port);
    toast.success(`Stopped ${p.process || `PID ${p.pid}`} on :${p.port}`);
  } catch (err) {
    toast.error(`Couldn't free :${p.port}: ${err}`);
  }
  await useListeningPorts.getState().load();
}

// A detached window has no main area of its own, so the main window shows it.
export function openPortsView(): void {
  if (IS_MIRROR_WINDOW) void FocusMainWindow(undefined, "ports");
  else useAppStore.getState().setView("ports");
}
