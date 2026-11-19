import { useCallback, useRef } from "react";
import { isMac } from "../platform";
import { useVideoAnswer } from "../store/videoAnswer";
import { ensureVideoReady } from "../store/videoSetup";
import { buildVideoRequest } from "../videoRequest";

// Agents seen to list the video skill, by CLI and folder. The composer's
// command list empties whenever it loses focus, so "listed right now" alone
// would make the button come and go with the caret.
const skillSeen = new Set<string>();

interface ComposerVideoInput {
  terminalId: string;
  cli: string | null;
  cwd: string;
  // Whether the agent's command list holds the video skill at this moment.
  listed: boolean;
  // The agent runs on this computer, so this computer is the one that records.
  local: boolean;
  guest: boolean;
}

// One terminal's "answer as a video" mode: whether its agent can make one and
// whether the next prompt asks for one. An agent on this Mac always offers it:
// the first click installs what's missing. One on another computer offers it
// only where that computer has the skill.
export function useComposerVideo({ terminalId, cli, cwd, listed, local, guest }: ComposerVideoInput) {
  const key = cli && !guest ? `${cli}\u0000${cwd}` : null;
  if (key && listed) skillSeen.add(key);
  const setsUp = key !== null && local && isMac;
  const available = setsUp || (key !== null && skillSeen.has(key));
  const offReason = local && !isMac ? "Videos record on a Mac" : null;

  const asked = useVideoAnswer((s) => terminalId in s.on);
  const on = asked && available && offReason === null;

  // Callers that read the prompt from a long-lived callback get today's mode,
  // not the one from the render that made the callback.
  const wrapNow = (text: string) => (on ? buildVideoRequest(cli, text) : text);
  const latest = useRef(wrapNow);
  latest.current = wrapNow;
  const wrap = useCallback((text: string) => latest.current(text), []);

  const setOn = useCallback(
    (next: boolean) => useVideoAnswer.getState().setOn(terminalId, next),
    [terminalId],
  );
  const toggle = useCallback(() => {
    const isOn = terminalId in useVideoAnswer.getState().on;
    if (isOn || !setsUp) {
      setOn(!isOn);
      return;
    }
    void ensureVideoReady(terminalId).then((ready) => {
      if (ready) setOn(true);
    });
  }, [setOn, terminalId, setsUp]);
  const turnOff = useCallback(() => setOn(false), [setOn]);

  return { available, offReason, on, wrap, toggle, turnOff };
}
