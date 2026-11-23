import { SaveClipboardImage, UploadClipboardImageForTerminal } from "../../../bridge/commands";
import { peerSlugOf } from "../../peer/markers";
import { useAppStore } from "../../store/app";
import { useComposerStore } from "../../store/composer";
import { insertComposerText } from "../../store/composerDrafts";
import type { TerminalTargetInfo } from "../../store/terminalTargets";
import { mentionTarget } from "../files/mentionInAgent";
import { pickPromptText, type BrowserPick } from "./pickPrompt";

export interface SentPick {
  target: TerminalTargetInfo;
  // Whether its picture made it in; it's left out when it couldn't be saved.
  pictured: boolean;
}

// Saved where the terminal can read it, the way a pasted image is: uploaded to
// the computer a paired project's terminal runs on, a temp file otherwise.
async function savePicture(terminalId: string, b64: string): Promise<string | null> {
  try {
    const path = peerSlugOf(terminalId)
      ? await UploadClipboardImageForTerminal(terminalId, b64, "image/png")
      : await SaveClipboardImage(b64, "image/png");
    return typeof path === "string" && path ? path : null;
  } catch {
    return null;
  }
}

/** The pick into the input of the project's agent (whichever input the project
 *  showed last), on lines of its own with its picture as a chip. An input that
 *  isn't on screen is opened and brought into view. Null when the project has
 *  no terminal to take it. */
export async function sendPickToAgent(projectName: string, pick: BrowserPick): Promise<SentPick | null> {
  const target = mentionTarget(projectName);
  if (!target) return null;
  const path = pick.image ? await savePicture(target.id, pick.image) : null;
  const images: Record<string, string> = path ? { "1": path } : {};
  if (!insertComposerText(target.id, target.historyKey, pickPromptText(pick, !!path), true, images)) {
    useComposerStore.getState().setOpen(true);
    useAppStore.getState().focusProjectTerminal(projectName, target.id);
  }
  return { target, pictured: !!path };
}
