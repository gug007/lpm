import { CancelFileDownload, DownloadProjectFile } from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import { revealLabel } from "../../machineWords";
import { toast } from "../../notifications/toast";
import { basename } from "../../path";
import { isPeerRoot } from "../../peer/markers";
import { transferToast } from "../../peer/uploadProgress";
import type { ProjectInfo } from "../../types";
import { revealInFinder } from "./fileActions";

interface DownloadProgress {
  id: string;
  received: number;
  total: number;
}

// An SSH project here, or any other project on a paired computer. A paired
// computer's own SSH project is left out: its files are on a third computer,
// and a read through the paired one would find that computer's disk instead.
export function canDownload(project: Pick<ProjectInfo, "root" | "isRemote"> | undefined): boolean {
  return !!project && project.isRemote !== isPeerRoot(project.root);
}

export async function downloadFile(projectRoot: string, rel: string): Promise<void> {
  const id = crypto.randomUUID();
  const name = basename(rel);
  const cancel = { label: "Cancel", onClick: () => void CancelFileDownload(id) };
  const off = EventsOn("file-download-progress", (p: DownloadProgress) => {
    if (p.id !== id) return;
    const { title, description } = transferToast(`Downloading ${name}…`, p.received, p.total);
    toast.loading(title, { id, description, cancel });
  });
  try {
    const saved: string | null = await DownloadProjectFile(id, projectRoot, rel);
    if (saved) {
      const reveal = { label: revealLabel(), onClick: () => void revealInFinder(saved) };
      toast.success(`Downloaded ${name}`, { id, action: reveal });
    } else {
      toast.dismiss(id);
    }
  } catch (err: unknown) {
    toast.error(String(err), { id });
  } finally {
    off();
  }
}
