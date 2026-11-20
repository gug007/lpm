import { BrowserOpenURL } from "../../../bridge/runtime";
import { toast } from "../../notifications/toast";

// The start of sys.rs's NO_GIT_BASH, which every spawn on Windows fails with
// until Git for Windows is there.
const NO_GIT_BASH = "Git for Windows isn't installed";
const GIT_FOR_WINDOWS_URL = "https://git-scm.com/downloads/win";

// A terminal that didn't open says so: failing silently reads as a dead button.
export function terminalStartFailed(err: unknown, what = "Couldn't open a terminal"): void {
  const reason = err instanceof Error ? err.message : String(err);
  if (reason.includes(NO_GIT_BASH)) {
    toast.error(NO_GIT_BASH, {
      id: "no-git-bash",
      description: "lpm runs terminals, services and agents in its Git Bash. Install it, then try again.",
      action: { label: "Get Git for Windows", onClick: () => BrowserOpenURL(GIT_FOR_WINDOWS_URL) },
    });
    return;
  }
  toast.error(`${what}: ${reason}`);
}
