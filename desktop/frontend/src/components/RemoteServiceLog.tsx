import { useEffect, useState } from "react";
import { Pane } from "./Pane";
import { useTerminalFontSize } from "../hooks/useTerminalFontSize";
import { remoteServiceLogs } from "../remoteServices";

const POLL_MS = 1500;

// Read-only view of a remote service pane's logs, reusing the local `Pane`
// component. The protocol serves log snapshots (no live stream), so this polls
// serviceLogs while mounted — the same re-request model the phone uses.
export function RemoteServiceLog({
  peerId,
  project,
  paneIndex,
  name,
}: {
  peerId: string;
  project: string;
  paneIndex: number;
  name: string;
}) {
  const [output, setOutput] = useState("");
  const { fontSize } = useTerminalFontSize();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const text = await remoteServiceLogs(peerId, project, paneIndex);
        if (!cancelled) setOutput(text);
      } catch {
        /* transient — next poll retries */
      }
      if (!cancelled) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [peerId, project, paneIndex]);

  return (
    <Pane
      output={output}
      fontSize={fontSize}
      sessionKey={`remote-svc:${peerId}:${project}:${paneIndex}`}
      label={name}
    />
  );
}
