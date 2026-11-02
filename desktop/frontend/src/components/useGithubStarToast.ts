import { useEffect } from "react";
import { githubStarAskDue } from "../githubStar";
import { openGithubStarPage, refreshGithubStarred } from "../githubStarred";
import { IS_MIRROR_WINDOW } from "../mirror";
import { toast } from "../notifications/toast";
import { useSettingsStore } from "../store/settings";
import { localDate } from "./stats/statsDates";

// Well after settings are read and launch toasts have come and gone.
const FIRST_CHECK_MS = 60_000;
const CHECK_EVERY_MS = 60 * 60_000;

/** Looks once per launch for a star already given on GitHub; without one, a
 *  single toast, ever, asks for it once lpm has been in use a week. */
export function useGithubStarToast(): void {
  useEffect(() => {
    if (IS_MIRROR_WINDOW) return;
    let live = true;

    const check = () => {
      const { githubStarSince, githubStarAsked, githubStarred, update } =
        useSettingsStore.getState();
      if (!live || githubStarAsked || githubStarred) return;
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
        action: { label: "Star on GitHub", onClick: openGithubStarPage },
        cancel: { label: "No thanks", onClick: () => {} },
      });
    };

    const first = window.setTimeout(() => void refreshGithubStarred().then(check), FIRST_CHECK_MS);
    const every = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      live = false;
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);
}
