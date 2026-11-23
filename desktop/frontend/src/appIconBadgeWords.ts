import { type Platform, platform } from "./platform";

// The Settings row for the count of waiting agents on the app's icon, named for
// where each system shows it.
export function appIconBadgeWords(p: Platform = platform): { label: string; description: string } {
  const description = "How many agents are waiting for you to answer";
  if (p === "macos") return { label: "Count on the Dock icon", description };
  if (p === "windows") return { label: "Count on the taskbar button", description };
  return { label: "Count on the launcher icon", description: `${description}, on docks that show counts` };
}
