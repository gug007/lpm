import { BrowserOpenURL } from "../bridge/runtime";
import { isMac } from "./platform";

// lpm installs a new version itself only on macOS; elsewhere the update notice
// leads to the release, installed the way the app was.
export const UPDATES_INSTALL_IN_APP = isMac;

export const RELEASE_PAGE_URL = "https://github.com/gug007/lpm/releases/latest";

export function openReleasePage(): void {
  BrowserOpenURL(RELEASE_PAGE_URL);
}
