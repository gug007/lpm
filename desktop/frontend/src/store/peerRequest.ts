import { PeerSend } from "../../bridge/commands";
import type { PeerFrame } from "./peers";

// Request/reply over the peer connection: send a frame and resolve when the
// matching reply frame arrives (matched on `t` plus whatever the reply echoes —
// `project`/`path`/`reqId`), rejecting on timeout. Replies route through the
// store's single peer-frame listener via `resolvePeerFrame`, so there is no
// listen-attach race. This is the one seam remote git (and future request/reply
// features) use instead of hand-correlating frames.

interface Pending {
  peerId: string;
  match: (frame: PeerFrame) => boolean;
  resolve: (frame: PeerFrame) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending: Pending[] = [];

/// Called for every inbound frame; resolves the first waiting request it matches.
export function resolvePeerFrame(peerId: string, frame: PeerFrame): void {
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    if (p.peerId === peerId && p.match(frame)) {
      clearTimeout(p.timer);
      pending.splice(i, 1);
      p.resolve(frame);
      return;
    }
  }
}

export function peerRequest<T = PeerFrame>(
  peerId: string,
  frame: Record<string, unknown>,
  match: (frame: PeerFrame) => boolean,
  timeoutMs = 15000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const entry: Pending = {
      peerId,
      match,
      resolve: resolve as (f: PeerFrame) => void,
      reject,
      timer: setTimeout(() => {
        const i = pending.indexOf(entry);
        if (i >= 0) pending.splice(i, 1);
        reject(new Error("The other Mac didn't respond in time."));
      }, timeoutMs),
    };
    pending.push(entry);
    void PeerSend(peerId, frame).catch(() => {
      const i = pending.indexOf(entry);
      if (i >= 0) {
        pending.splice(i, 1);
        clearTimeout(entry.timer);
        reject(new Error("Couldn't reach this Mac."));
      }
    });
  });
}

let reqSeq = 0;
export function nextReqId(): string {
  reqSeq += 1;
  return `r${reqSeq}`;
}
