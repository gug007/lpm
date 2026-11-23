import { useCallback, useEffect, useRef, useState } from "react";
import { CancelBrowserPick, PickInBrowser } from "../../../bridge/commands";
import { toast } from "../../notifications/toast";
import type { BrowserPick } from "./pickPrompt";
import { sendPickToAgent } from "./sendPickToAgent";

const NO_TERMINAL = "Open an agent or a terminal in this project, then pick again";

/** Picking on the browser tab `id`'s page for the project's agent: `toggle`
 *  starts a pick or ends the one running. It also ends on Esc, when the page
 *  goes out of view, and when the tab closes. */
export function usePickInBrowser(id: string, projectName: string, shown: boolean) {
  const [picking, setPicking] = useState(false);
  const mounted = useRef(true);

  const cancel = useCallback(() => {
    CancelBrowserPick(id).catch(() => {});
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [cancel]);

  useEffect(() => {
    if (picking && !shown) cancel();
  }, [picking, shown, cancel]);

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [picking, cancel]);

  const toggle = useCallback(async () => {
    if (picking) {
      cancel();
      return;
    }
    setPicking(true);
    try {
      const pick = (await PickInBrowser(id)) as BrowserPick | null;
      if (!pick) return;
      const sent = await sendPickToAgent(projectName, pick);
      if (!sent) toast.error(NO_TERMINAL);
      else if (!sent.pictured) toast.warning(`Added to ${sent.target.label || "the agent"}'s input without a picture`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      if (mounted.current) setPicking(false);
    }
  }, [id, projectName, picking, cancel]);

  return { picking, toggle };
}
