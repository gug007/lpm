import { useState } from "react";
import { BTN_SECONDARY } from "./ui/buttons";

const INSTALL_CMD = "npx skills add gug007/lpm";

// Inline install command + copy button for the lpm agent skills. A button click
// is a user gesture, so WKWebView allows the clipboard write.
export function SkillInstallControl() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — leave the command visible to copy manually.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="rounded bg-[var(--bg-active)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
        {INSTALL_CMD}
      </code>
      <button onClick={copy} className={BTN_SECONDARY}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
