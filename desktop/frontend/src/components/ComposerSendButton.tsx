import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { SEND_SHELL_CLASS, sendFaceClass, sendGlow, sendShellTint } from "./composerSendStyles";
import { SendIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";

interface ComposerSendButtonProps {
  // Nothing to send (empty/whitespace).
  disabled: boolean;
  // The field is locked while something is running — hold off.
  busy?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  label?: string;
}

// The composer send pill without the split button's caret half: same accent
// fill, glow and inert treatment, for composers that only send.
export function ComposerSendButton({
  disabled,
  busy = false,
  type = "button",
  onClick,
  label = "Send",
}: ComposerSendButtonProps) {
  const inert = disabled || busy;

  return (
    <div className={`shrink-0 ${SEND_SHELL_CLASS} ${sendShellTint(inert)}`} style={sendGlow(inert)}>
      <Tooltip content="Send  ·  ↵" delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          type={type}
          onClick={onClick}
          disabled={inert}
          aria-label={label}
          className={sendFaceClass(inert, "rounded-lg")}
        >
          <SendIcon />
        </button>
      </Tooltip>
    </div>
  );
}
