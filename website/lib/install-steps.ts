import {
  GIT_FOR_WINDOWS_URL,
  type DownloadEntry,
  type DownloadPlatform,
} from "./downloads";

export type InstallStep = {
  text: string;
  command?: string;
  link?: { href: string; label: string };
};

const ADD_PROJECT =
  "Click + in the sidebar and pick a project folder. lpm finds the dev servers in it.";

const LINUX_OPEN: InstallStep = {
  text: `Open lpm from your app menu. ${ADD_PROJECT}`,
};

const STEPS: Record<DownloadPlatform, (file: string) => InstallStep[]> = {
  "mac-arm": macSteps,
  "mac-intel": macSteps,
  "windows-x64": (file) => [
    { text: `Run ${file}. It installs for your user, with no admin rights.` },
    {
      text: "If SmartScreen says Windows protected your PC, choose More info, then Run anyway. The beta isn't code-signed yet.",
    },
    {
      text: "lpm runs commands through Git Bash, so install Git for Windows if you don't have it.",
      link: { href: GIT_FOR_WINDOWS_URL, label: "Get Git for Windows" },
    },
    { text: `Open lpm from the Start menu. ${ADD_PROJECT}` },
  ],
  "linux-deb": (file) => [
    { text: "Install the package:", command: `sudo apt install ~/Downloads/${file}` },
    LINUX_OPEN,
  ],
  "linux-rpm": (file) => [
    { text: "Install the package:", command: `sudo dnf install ~/Downloads/${file}` },
    LINUX_OPEN,
  ],
  "linux-appimage": (file) => [
    {
      text: "Unlike the packages, the AppImage doesn't bring its tools along: install Git, SSH and wl-clipboard or xclip if you don't have them.",
    },
    { text: "Make it executable:", command: `chmod +x ~/Downloads/${file}` },
    { text: "Run it:", command: `~/Downloads/${file}` },
    { text: ADD_PROJECT },
  ],
};

function macSteps(file: string): InstallStep[] {
  return [
    { text: `Open ${file} from your Downloads folder.` },
    { text: "Drag lpm into Applications." },
    {
      text: "Open lpm from Applications. macOS asks once whether to open an app from the internet: choose Open.",
    },
    { text: ADD_PROJECT },
  ];
}

export function installSteps(entry: DownloadEntry): InstallStep[] {
  return STEPS[entry.platform](entry.filename);
}
