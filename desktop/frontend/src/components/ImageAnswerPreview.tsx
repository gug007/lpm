import type { AICLI } from "../types";
import { AnswerPreviewCard } from "./AnswerPreviewCard";
import { GeneratedImageReply } from "./GeneratedImageReply";
import { ImageSettingsLine } from "./ImageSettingsLine";

// The image button's hover card: a prompt as it would be typed and the agent's
// reply as the image it makes, then the model that makes it.
export function ImageAnswerPreview({ agent, on = false }: { agent: AICLI | null; on?: boolean }) {
  return (
    <AnswerPreviewCard
      kind="image"
      agent={agent}
      question="A hero image for the pricing page"
      reply={<GeneratedImageReply />}
      title={on ? "Generating an image" : "Generate image"}
      about="Ask as usual. The reply is an image, saved in the project."
      on={on}
      foot={<ImageSettingsLine />}
    />
  );
}
