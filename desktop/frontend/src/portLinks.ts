import { IS_MIRROR_WINDOW } from "./mirror";
import { copyProjectPortUrl, openProjectPort } from "./peer/projectPorts";
import { isLinux, isMac } from "./platform";
import { protocolForPort } from "./portProtocols";
import { requestProjectBrowser } from "./store/browserRequest";

export interface PortLinkTarget {
  // The Browser tab's name, e.g. "web :3000".
  label?: string;
  // The pane to open the tab in, beside the service whose link it was.
  paneId?: string;
}

// Linux shows pages in the default browser anyway (see BrowserPane), and a
// detached window's Browser tabs live in the main window.
export const BROWSER_IN_APP = !isLinux && !IS_MIRROR_WINDOW;

export const PORT_LINK_HINT = BROWSER_IN_APP
  ? `Open in lpm · ${isMac ? "⌥-click" : "Alt+click"} opens your default browser`
  : "Open in your default browser";

export function portTabLabel(port: number, service?: string): string {
  return service ? `${service} :${port}` : `localhost:${port}`;
}

// A project's server in its own Browser tab, or in the default browser where
// lpm shows none.
export function openPortInLpm(projectName: string, port: number, target: PortLinkTarget = {}): void {
  if (!BROWSER_IN_APP) {
    void openProjectPort(projectName, port);
    return;
  }
  requestProjectBrowser(projectName, `http://localhost:${port}`, target);
}

export function openPortLink(
  projectName: string,
  port: number,
  altKey: boolean,
  target: PortLinkTarget = {},
): void {
  const protocol = protocolForPort(port);
  if (protocol && !altKey) void copyProjectPortUrl(projectName, port, protocol.scheme);
  else if (altKey) void openProjectPort(projectName, port);
  else openPortInLpm(projectName, port, target);
}
