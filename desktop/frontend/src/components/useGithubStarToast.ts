import { useEffect } from "react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { GITHUB_REPO_URL } from "../githubIssue";
import { githubStarAskDue } from "../githubStar";
import { IS_MIRROR_WINDOW } from "../mirror";
import { toast } from "../notifications/toast";
import { useSettingsStore } from "../store/settings";
import { localDate } from "./stats/statsDates";

// Well after settings are read and launch toasts have come and gone.
const FIRST_CHECK_MS = 60_000;
const CHECK_EVERY_MS = 60 * 60_000;

/** One toast, ever, asking for a star on GitHub once lpm has been in use a week. */
export function useGithubStarToast(): void {
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;

    const check = () => {
      const { githubStarSince, githubStarAsked, update } = useSettingsStore.getState();
      if (githubStarAsked) return;
      const today = localDate();
      if (!githubStarSince) {
        void update({ githubStarSince: today });
        return;
      }
      if (!githubStarAskDue(githubStarSince, today)) return;
      void update({ githubStarAsked: true });
      toast("Enjoying lpm?", {
        id: "github-star",
        description: "It's free and open source. A star on GitHub helps other developers find it.",
        duration: Infinity,
        action: { label: "Star on GitHub", onClick: () => BrowserOpenURL(GITHUB_REPO_URL) },
        cancel: { label: "No thanks", onClick: () => {} },
      });
    };

    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const every = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
}
