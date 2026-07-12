import { peerRequest } from "./store/peerRequest";
import type { PeerFrame } from "./store/peers";

const REQUEST_TIMEOUT = 15000;

// Read/write a peer project's per-key AI-instruction override (commit | pr-title
// | pr-description | branch-name) over the wire. These live in their own .txt
// files on the peer (templates.rs), not the config YAML, so they get their own
// messages. Shape mirrors the local ReadProjectInstructions/SaveProjectInstructions
// bridge commands the instruction editors call, so they drop in unchanged.
export interface RemoteInstructionsIO {
  read(project: string, key: string): Promise<string>;
  write(project: string, key: string, content: string): Promise<void>;
}

export function makeRemoteInstructionsSource(peerId: string): RemoteInstructionsIO {
  return {
    async read(project: string, key: string): Promise<string> {
      const r = (await peerRequest(
        peerId,
        { t: "aiInstructionsRead", project, key },
        (f) => f.t === "aiInstructionsRead" && f.project === project && f.key === key,
        REQUEST_TIMEOUT,
      )) as PeerFrame;
      if (r.ok === false) throw new Error((r.error as string) || "Couldn't read instructions on the other Mac.");
      return (r.text as string) ?? "";
    },

    async write(project: string, key: string, content: string): Promise<void> {
      const r = (await peerRequest(
        peerId,
        { t: "aiInstructionsWrite", project, key, text: content },
        (f) => f.t === "aiInstructionsWrite" && f.project === project && f.key === key,
        REQUEST_TIMEOUT,
      )) as PeerFrame;
      if (r.ok === false) throw new Error((r.error as string) || "Couldn't save instructions on the other Mac.");
    },
  };
}
