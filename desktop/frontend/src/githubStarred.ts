import { GithubStarred } from "../bridge/commands";
import { BrowserOpenURL } from "../bridge/runtime";
import { GITHUB_REPO_URL } from "./githubIssue";
import { useSettingsStore } from "./store/settings";

let recheckOnReturn = false;

/** Asks `gh` whether its signed-in account has starred lpm, and remembers a yes
 *  so the Star on GitHub row and toast stay gone. A no, or no `gh`, changes
 *  nothing: a star can't be told apart from a missing `gh`. */
export async function refreshGithubStarred(): Promise<boolean> {
  const { githubStarred, update } = useSettingsStore.getState();
  if (githubStarred) return true;
  const starred = (await GithubStarred().catch(() => false)) === true;
  if (starred) await update({ githubStarred: true });
  return starred;
}

/** Opens lpm's repo to star it, and looks again once lpm is back in front. */
export function openGithubStarPage(): void {
  BrowserOpenURL(GITHUB_REPO_URL);
  if (recheckOnReturn) return;
  recheckOnReturn = true;
  window.addEventListener(
    "focus",
    () => {
      recheckOnReturn = false;
      void refreshGithubStarred();
    },
    { once: true },
  );
}
