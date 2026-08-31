// Client half of a peer file attach: a file dropped on (or copied into) a
// terminal that runs on another Mac exists only here, so its bytes are read
// locally and handed to the host, which writes a copy under the original
// basename — scp'ing it on to the remote for an ssh-backed host pane — and
// answers with the RAW path that machine can read. Callers paste-format that
// path themselves, exactly as they would a local one.
import { NotesReadFileAsInput, UploadFileForTerminal } from "../../bridge/commands";
import { basename } from "../path";
import { PEER_UPLOAD_MAX_BYTES } from "./markers";

export async function uploadPeerBytes(
  terminalId: string,
  b64: string,
  mimeType: string,
  name: string,
): Promise<string> {
  const hostPath = await UploadFileForTerminal(
    terminalId,
    b64,
    mimeType || "application/octet-stream",
    name,
  );
  if (typeof hostPath !== "string" || !hostPath) {
    throw new Error(`the remote Mac did not save ${name}`);
  }
  return hostPath;
}

export async function uploadPeerFile(terminalId: string, path: string): Promise<string> {
  const input = await NotesReadFileAsInput(path, PEER_UPLOAD_MAX_BYTES);
  const b64: string | undefined = input?.data;
  if (!b64) throw new Error(`could not read ${basename(path)}`);
  return uploadPeerBytes(terminalId, b64, input.mimeType, input.name || basename(path));
}

// Host paths in the order given. Rejects with the first failure's message — a
// read that was refused (oversize), or a host that couldn't take the file.
export function uploadPeerFiles(terminalId: string, paths: string[]): Promise<string[]> {
  return Promise.all(paths.map((p) => uploadPeerFile(terminalId, p)));
}
