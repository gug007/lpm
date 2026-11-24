import { NotesReadFileAsInput, ReadHostFile } from "../../bridge/commands";
import { isPeerRoot, PEER_UPLOAD_MAX_BYTES } from "../peer/markers";
import type { HostFile } from "../sshProjects";

export interface FileBytes {
  mimeType?: string;
  data: string;
}

// A whole file's bytes for a preview: this computer's, a connected one's, or an
// SSH host's. A connected computer reads its own SSH host in one frame.
export function readFileBytes(path: string, host: HostFile | null, maxBytes: number): Promise<FileBytes> {
  if (!host) return NotesReadFileAsInput(path, maxBytes);
  const cap = isPeerRoot(host.root) ? Math.min(maxBytes, PEER_UPLOAD_MAX_BYTES) : maxBytes;
  return ReadHostFile(host.root, host.rel, cap);
}
