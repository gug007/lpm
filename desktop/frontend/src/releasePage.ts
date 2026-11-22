import { BrowserOpenURL } from "../bridge/runtime";
import { isMac, isWindows } from "./platform";

// lpm installs a new version itself on macOS and Windows; on Linux the update
// notice leads to the release, installed the way the app was.
export const UPDATES_INSTALL_IN_APP = isMac || isWindows;

const RELEASES_URL = "https://github.com/gug007/lpm/releases";

/** A release's page — a Beta build is never the latest one — or the
 *  latest stable release's. */
export function openReleasePage(version?: string): void {
  BrowserOpenURL(version ? `${RELEASES_URL}/tag/v${version}` : `${RELEASES_URL}/latest`);
}
