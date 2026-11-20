import { useCallback, useRef } from "react";
import { buildAnswerRequest, type AnswerKind } from "../answerKind";
import { useAnswerMode } from "../store/answerMode";
import { useComposerVideo, type ComposerVideoInput } from "./useComposerVideo";

interface ComposerAnswerInput extends ComposerVideoInput {
  // The terminal belongs to an SSH project, whose agents can't reach lpm's
  // image keys.
  ssh: boolean;
}

// One answer kind as the composer offers it.
export interface ComposerAnswerTool {
  on: boolean;
  onToggle: () => void;
  // Why this terminal can't ask for it; the tool then says so instead of acting.
  offReason: string | null;
}

// Each kind's tool; null where the terminal's agent can't make one.
export type ComposerAnswerTools = Record<AnswerKind, ComposerAnswerTool | null>;

// One terminal's answer mode: whether the next prompt asks its agent for a
// video or an image instead of a text answer, which of those its agent can
// make, and the prompt as it goes out.
export function useComposerAnswer({ ssh, ...input }: ComposerAnswerInput) {
  const { terminalId, cli, guest } = input;
  const video = useComposerVideo(input);
  const picked = useAnswerMode((s) => s.modes[terminalId] ?? null);

  const toggleImage = () => {
    const { modes, setMode } = useAnswerMode.getState();
    setMode(terminalId, modes[terminalId] === "image" ? null : "image");
  };
  const offers: Record<AnswerKind, { offReason: string | null; toggle: () => void } | null> = {
    video: video.available ? { offReason: video.offReason, toggle: video.toggle } : null,
    image:
      cli !== null && !guest
        ? { offReason: ssh ? "Not available in SSH projects" : null, toggle: toggleImage }
        : null,
  };
  const offer = picked && offers[picked];
  const kind = offer && offer.offReason === null ? picked : null;

  // Callers that read the prompt from a long-lived callback get today's mode,
  // not the one from the render that made the callback.
  const wrapNow = (text: string) => (kind ? buildAnswerRequest(kind, cli, text) : text);
  const latest = useRef(wrapNow);
  latest.current = wrapNow;
  const wrap = useCallback((text: string) => latest.current(text), []);
  const turnOff = useCallback(() => useAnswerMode.getState().setMode(terminalId, null), [terminalId]);

  const tool = (k: AnswerKind): ComposerAnswerTool | null => {
    const o = offers[k];
    return o && { on: kind === k, onToggle: o.toggle, offReason: o.offReason };
  };
  const tools: ComposerAnswerTools = { video: tool("video"), image: tool("image") };
  return { kind, wrap, turnOff, tools };
}
