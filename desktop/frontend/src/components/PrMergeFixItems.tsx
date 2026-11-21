import { startFix } from "../ciFix";
import type { LaunchpadOption } from "../launchpadAgentActions";
import { baseName } from "../prMerge";
import type { PullRequestMergeInfo } from "../types";
import { FixWithAgentItems } from "./FixWithAgentItems";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";

/** Fix with … rows while checks fail or the branch conflicts with its base:
 *  the Mac sends a prompt only then. */
export function PrMergeFixItems({
  info,
  projectName,
  onClose,
}: {
  info: PullRequestMergeInfo;
  projectName: string;
  onClose: () => void;
}) {
  const prompt = info.fixPrompt ?? info.resolvePrompt;
  if (!prompt) return null;
  const fix = (option: LaunchpadOption) => {
    onClose();
    startFix(projectName, option, prompt);
  };
  const description = info.fixPrompt
    ? "Opens a new tab with the failing checks"
    : `Opens a new tab to merge ${baseName(info)} in and resolve the conflicts`;
  return (
    <>
      <ContextMenuSeparator />
      <FixWithAgentItems projectName={projectName} onFix={fix} description={description} />
    </>
  );
}
