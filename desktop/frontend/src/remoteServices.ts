import { peerRequest } from "./store/peerRequest";

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
