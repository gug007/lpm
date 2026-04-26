import { toast } from "sonner";
import { AddPortForward } from "../../../wailsjs/go/main/App";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";

// forwardPortAndOpen requests a tunnel for the given remote port,
// reports the outcome via toast, and opens the resulting localhost URL
// in the browser on success. localPort=0 leaves the choice to the
// backend (mirrors the remote port when free, picks a free one
// otherwise). Used by both the suggestion popover and the toast
// action so they stay in sync.
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
