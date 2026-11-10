import { useEffect, useRef, useState } from "react";
import { JobLiveOutput as FetchJobLiveOutput } from "../../../../bridge/commands";
import { cleanLive } from "../../../jobLive";

const POLL_MS = 2000;

// What a running job has said so far, polled while it runs, without terminal
// codes. `waiting` = this machine has the run (a shared job's run may be in
// another project), so an empty text means it printed nothing yet. `onGrow`
// hears each change, for a scroll-anchored host to follow it.
export function useJobLiveText(
  project: string,
  jobId: string,
  running: boolean,
  onGrow?: () => void,
): { text: string; waiting: boolean } {
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const lastRaw = useRef<string | undefined>(undefined);
  const onGrowRef = useRef(onGrow);
  onGrowRef.current = onGrow;

  useEffect(() => {
    if (!running) {
      lastRaw.current = undefined;
      setText("");
      setWaiting(false);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = (await FetchJobLiveOutput(project, jobId)) as { text?: string } | null;
        if (cancelled) return;
        setWaiting(res != null);
        if (res?.text === lastRaw.current) return;
        lastRaw.current = res?.text;
        setText(cleanLive(res?.text));
        onGrowRef.current?.();
      } catch {
        // A failed poll keeps the last text; the next one retries.
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [project, jobId, running]);

  return { text, waiting };
}
