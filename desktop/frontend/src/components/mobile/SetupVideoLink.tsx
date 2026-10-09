import { SquarePlay } from "lucide-react";
import { LINK_BUTTON } from "./styles";
import { BrowserOpenURL } from "../../../bridge/runtime";
import { SETUP_VIDEO_LENGTH, SETUP_VIDEO_URL } from "../../mobile/links";

/** The setup lesson on YouTube, beside the steps it walks through. */
export function SetupVideoLink() {
  return (
    <button
      onClick={() => BrowserOpenURL(SETUP_VIDEO_URL)}
      className={`${LINK_BUTTON} inline-flex shrink-0 items-center gap-1.5 text-xs font-medium`}
    >
      <SquarePlay size={14} />
      Setup video · {SETUP_VIDEO_LENGTH}
    </button>
  );
}
