import { ExternalLink } from "lucide-react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { TEXT_ACTION } from "./ui/buttons";

export function PrOpenOnGitHub({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onClose();
        BrowserOpenURL(url);
      }}
      className={`${TEXT_ACTION} shrink-0 whitespace-nowrap`}
    >
      <ExternalLink size={11} />
      Open on GitHub
    </button>
  );
}
