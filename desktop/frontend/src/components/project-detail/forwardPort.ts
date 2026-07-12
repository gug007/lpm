import { toast } from "sonner";
import { AddPortForward } from "../../../bridge/commands";
import { BrowserOpenURL } from "../../../bridge/runtime";

// localPort=0 leaves the choice to the backend (mirrors the remote port
// when free, picks a free one otherwise).
export async function forwardPortAndOpen(
  projectName: string,
  remotePort: number,
  localPort = 0,
): Promise<void> {
  try {
    const pf = await AddPortForward(projectName, remotePort, localPort);
    const url = `http://localhost:${pf.localPort}`;
    toast.success(`Forwarded :${remotePort} → ${url}`);
    BrowserOpenURL(url);
  } catch (err) {
    toast.error(`Forward :${remotePort}: ${err}`);
  }
}
