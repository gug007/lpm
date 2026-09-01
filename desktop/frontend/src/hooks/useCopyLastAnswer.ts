import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentLastAnswer, SetClipboardText } from "../../bridge/commands";
import type { AgentSessionRef } from "../agentSession";

const COPIED_FLASH_MS = 1500;

/** Copies the agent's last answer — read from its own session transcript, so
 *  the clipboard gets the original markdown (tables intact) rather than what a
 *  drag-selection over the rendered terminal would capture. `copied` flashes
 *  true briefly after a successful copy. */
export function useCopyLastAnswer(projectName: string, session: AgentSessionRef) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      const text = await AgentLastAnswer(
        projectName,
        session.provider,
        session.sessionId,
      );
      if (!text?.trim()) {
        toast.info("No answer to copy yet");
        return;
      }
      await SetClipboardText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_FLASH_MS);
    } catch (err) {
      toast.error(String(err));
    }
  };

  return { copied, copy };
}
