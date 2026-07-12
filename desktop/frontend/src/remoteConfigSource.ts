import { peerRequest } from "./store/peerRequest";
import type { PeerFrame } from "./store/peers";

const REQUEST_TIMEOUT = 15000;

// The remote config editor's data layer: read/save the peer project's user YAML
// over the wire (configRead/configWrite), which the peer runs through the same
// config_cmds path the local editor uses — so syntax validation and rename
// routing behave identically. `save` rejects with the validation message so the
// editor surfaces it exactly like a local save.
export interface RemoteConfigSource {
  load(): Promise<string>;
  save(content: string): Promise<void>;
}

export function makeRemoteConfigSource(peerId: string, project: string): RemoteConfigSource {
  return {
    async load(): Promise<string> {
      const r = (await peerRequest(
        peerId,
        { t: "configRead", project },
        (f) => f.t === "configRead" && f.project === project,
        REQUEST_TIMEOUT,
      )) as PeerFrame;
      if (r.ok === false) throw new Error((r.error as string) || "Couldn't read the config on the other Mac.");
      return (r.text as string) ?? "";
    },

    async save(content: string): Promise<void> {
      const r = (await peerRequest(
        peerId,
        { t: "configWrite", project, text: content },
        (f) => f.t === "configWrite" && f.project === project,
        REQUEST_TIMEOUT,
      )) as PeerFrame;
      if (r.ok === false) throw new Error((r.error as string) || "Couldn't save the config on the other Mac.");
    },
  };
}
