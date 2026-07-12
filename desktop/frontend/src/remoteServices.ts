import { peerRequest } from "./store/peerRequest";
import type { PeerFrame } from "./store/peers";

export interface RemoteServiceInfo {
  name: string;
  paneIndex: number | null;
  running: boolean;
  cmd?: string;
  port?: number;
}

// The remote project's services (for the service tabs + log viewer). Mirrors the
// phone's `services` request: when running, each entry carries a `paneIndex` for
// serviceLogs; when stopped, paneIndex is null.
export async function remoteServices(peerId: string, project: string): Promise<RemoteServiceInfo[]> {
  const r = await peerRequest(
    peerId,
    { t: "services", project },
    (f) => f.t === "services" && f.project === project,
    10000,
  );
  return r.ok === false ? [] : ((r.services as RemoteServiceInfo[]) ?? []);
}

// A snapshot of a running service pane's recent output. The protocol has no live
// stream for this (the phone re-requests too), so the viewer polls.
export async function remoteServiceLogs(
  peerId: string,
  project: string,
  paneIndex: number,
  lines = 200,
): Promise<string> {
  const r = await peerRequest(
    peerId,
    { t: "serviceLogs", project, paneIndex, lines },
    (f) => f.t === "serviceLogs" && f.project === project && f.paneIndex === paneIndex,
    10000,
  );
  return r.ok === false ? "" : ((r.text as string) ?? "");
}

// Restart a single running service on the peer, through the same
// restart_service_by_name path the local Controls restart uses. Throws on error
// so the caller toasts in product terms.
export async function remoteRestartService(
  peerId: string,
  project: string,
  service: string,
): Promise<void> {
  const r = (await peerRequest(
    peerId,
    { t: "restartService", name: project, service },
    (f) => f.t === "restartService" && f.name === project && f.service === service,
    15000,
  )) as PeerFrame;
  if (r.ok === false) throw new Error((r.error as string) || "Couldn't restart the service on the other Mac.");
}
