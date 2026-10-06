import { machineWords } from "./machineWords";
import { platform as currentPlatform, type Platform } from "./platform";

// Off macOS the app belongs to its installer, so Remove cleans up what lpm put
// on the machine and the copy says where to finish.

export function removeAppDescription(p: Platform = currentPlatform): string {
  if (p === "macos") {
    return `Uninstall lpm and everything it installed on ${machineWords(true).thisMachine}`;
  }
  return "Remove lpm's command line tool, agent skills and hooks before you uninstall it";
}

export function removeAppConfirmText(p: Platform = currentPlatform): string {
  const finish =
    p === "windows"
      ? "in Settings > Apps > Installed apps"
      : "with your package manager, or delete the AppImage";
  return (
    `lpm's command line tool, agent skills and hooks will be removed from ` +
    `${machineWords(false).thisMachine}, and running projects will be stopped. ` +
    `Then uninstall the app itself ${finish}. Your settings and project folders are kept.`
  );
}
