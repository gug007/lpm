import type { AnswerKind } from "../answerKind";
import { ImageIcon, PlayIcon, VideoIcon } from "./icons";

interface AnswerKindIconProps {
  kind: AnswerKind;
  size?: number;
  // The Send pill's face shows a video as a play mark rather than a camera,
  // and solid, so smaller than the outlined image mark.
  onSend?: boolean;
}

// The mark of what the next prompt comes back as, shared by its tool, its
// hover card and the Send pill that sends for it.
export function AnswerKindIcon({ kind, size = 14, onSend = false }: AnswerKindIconProps) {
  if (kind === "image") return <ImageIcon size={onSend ? 12 : size} />;
  return onSend ? <PlayIcon size={10} /> : <VideoIcon size={size} />;
}
