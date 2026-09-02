// Client half of a peer file attach: a file dropped on (or copied into) a
// terminal that runs on another Mac exists only here, so its bytes are handed to
// the host, which writes a copy under the original basename — scp'ing it on to
// the remote for an ssh-backed host pane — and answers with the RAW path that
// machine can read. Callers paste-format that path themselves, exactly as they
// would a local one.
//
// The path goes through Rust, which streams the file in chunks and so is bounded
// by the host's disk rather than by one WebSocket frame.
import { PeerUploadFile } from "../../bridge/commands";
import { basename } from "../path";
import { peerSlugOf, stripMarker } from "./markers";
import { trackPeerUpload } from "./uploadProgress";

// Identifies one transfer end to end: Rust stamps every progress event with it,
// so a toast can follow the file it was minted for.
export function newUploadToken(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return (
    uuid ||
    `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export async function uploadPeerFile(
  terminalId: string,
  path: string,
  token = newUploadToken(),
): Promise<string> {
  const name = basename(path);
  const slug = peerSlugOf(terminalId);
  if (!slug) throw new Error(`${name} is not going to another Mac`);
  const hostPath = await trackPeerUpload(
    token,
    slug,
    name,
    PeerUploadFile(slug, stripMarker(terminalId), path, token),
  );
  if (typeof hostPath !== "string" || !hostPath) {
    throw new Error(`the remote Mac did not save ${name}`);
  }
  return hostPath;
}

// Host paths in the order given. Rejects with the first failure's message — a
// file the host wouldn't take, or a host too old to take one this size.
export function uploadPeerFiles(
  terminalId: string,
  paths: string[],
): Promise<string[]> {
  return Promise.all(paths.map((p) => uploadPeerFile(terminalId, p)));
}
