import { buildImageRequest } from "./imageRequest";
import { buildVideoRequest } from "./videoRequest";

// What the next prompt asks the agent to answer with, instead of text.
export type AnswerKind = "video" | "image";

// What a prompt asks the agent for while each kind is on.
export const ANSWER_KINDS: Record<AnswerKind, { askedFor: string }> = {
  video: { askedFor: "a video" },
  image: { askedFor: "an image" },
};

export const answerSendLabel = (kind: AnswerKind) => `Send for ${ANSWER_KINDS[kind].askedFor}`;

/** The prompt as the agent receives it while the next prompt asks for `kind`. */
export function buildAnswerRequest(kind: AnswerKind, cli: string | null, prompt: string): string {
  return kind === "video" ? buildVideoRequest(cli, prompt) : buildImageRequest(prompt);
}
