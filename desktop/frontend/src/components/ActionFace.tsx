import type { ActionInfo } from "../types";
import { withEmoji } from "../withEmoji";
import { EmojiLabel } from "./EmojiLabel";
import { SvgLabel } from "./SvgLabel";

// What a button shows: its `labelSvg` edge to edge, else its text with `padding`.
export function ActionFace({ action, padding }: { action: ActionInfo; padding: string }) {
  const text = (
    <span className={`flex items-center ${padding}`}>
      <EmojiLabel emoji={action.emoji} label={action.label} />
    </span>
  );
  if (!action.labelSvg) return text;
  return <SvgLabel markup={action.labelSvg} alt={withEmoji(action.emoji, action.label)} fallback={text} />;
}
