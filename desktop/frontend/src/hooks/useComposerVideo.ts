import { useCallback } from "react";
import { isMac } from "../platform";
import { useAnswerMode } from "../store/answerMode";
import { ensureVideoReady } from "../store/videoSetup";

// Agents seen to list the video skill, by CLI and folder. The composer's
// command list empties whenever it loses focus, so "listed right now" alone
// would make the button come and go with the caret.
const skillSeen = new Set<string>();

export interface ComposerVideoInput {
  terminalId: string;
  cli: string | null;
  cwd: string;
  // Whether the agent's command list holds the video skill at this moment.
  listed: boolean;
  // The agent runs on this computer, so this computer is the one that records.
  local: boolean;
  guest: boolean;
}

// Whether one terminal's agent can make a video, and the toggle that asks for
// one. An agent on this Mac always offers it: the first click installs what's
// missing. One on another computer offers it only where that computer has the
// skill.
export function useComposerVideo({ terminalId, cli, cwd, listed, local, guest }: ComposerVideoInput) {
  const key = cli && !guest ? `${cli}\u0000${cwd}` : null;
  if (key && listed) skillSeen.add(key);
  const setsUp = key !== null && local && isMac;
  const available = setsUp || (key !== null && skillSeen.has(key));
  const offReason = local && !isMac ? "Videos record on a Mac" : null;

  const toggle = useCallback(() => {
    const { modes, setMode } = useAnswerMode.getState();
    if (modes[terminalId] === "video" || !setsUp) {
      setMode(terminalId, modes[terminalId] === "video" ? null : "video");
      return;
    }
    void ensureVideoReady(terminalId).then((ready) => {
      if (ready) useAnswerMode.getState().setMode(terminalId, "video");
    });
  }, [terminalId, setsUp]);

  return { available, offReason, toggle };
}
