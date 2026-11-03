import { useEffect } from "react";
import { BrowserOpenURL, EventsOn } from "../../bridge/runtime";
import { fixTabs, preferredFixOption, startFix } from "../ciFix";
import { CI_RESULT_EVENT, PEER_CI_RESULT_EVENT, ciToast, type CiResult } from "../ciResult";
import { toast } from "../notifications/toast";

/** A toast when CI finishes on a commit pushed from here or from a connected
 *  computer: failed, with the agent last used for a fix a click away, or
 *  passing again. A newer
 *  result for the branch replaces the last one. */
export function useCiResultToasts(): void {
  useEffect(() => {
    const show = (result: CiResult) => {
      if (!result?.project || !result.branch) return;
      const id = `ci:${result.slug ?? ""}:${result.project}/${result.branch}`;
      const { title, description, tag } = ciToast(result);
      const open = result.url ? { label: "Open", onClick: () => BrowserOpenURL(`${result.url}/checks`) } : undefined;
      if (result.passed) {
        toast.success(title, { id, description, tag, event: "ci", action: open });
        return;
      }
      const prompt = result.slug ? undefined : result.fixPrompt;
      const agent = prompt ? preferredFixOption(fixTabs(result.project)) : null;
      const fix =
        prompt && agent
          ? { label: `Fix with ${agent.label}`, onClick: () => startFix(result.project, agent, prompt) }
          : undefined;
      toast.error(title, {
        id,
        description,
        tag,
        event: "ci",
        action: fix ?? open,
        actions: fix && open ? [open] : undefined,
      });
    };
    const offLocal = EventsOn(CI_RESULT_EVENT, (result: CiResult) => show({ ...result, slug: undefined }));
    const offPeers = EventsOn(PEER_CI_RESULT_EVENT, (result: CiResult) => {
      if (result?.slug) show(result);
    });
    return () => {
      offLocal();
      offPeers();
    };
  }, []);
}
