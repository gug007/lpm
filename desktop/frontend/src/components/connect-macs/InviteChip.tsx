import { useState } from "react";

// The invite string as one copy-and-hand-off object. The chip truncates; the
// button carries the whole action. Copying happens inside the click gesture —
// WKWebView only permits clipboard writes from a user gesture.
export function InviteChip({ invite }: { invite: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      .writeText(invite)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <div className="flex items-stretch gap-2">
      <code
        title={invite}
        className="min-w-0 flex-1 self-center truncate rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs text-[var(--text-secondary)]"
      >
        {invite}
      </code>
      <button
        onClick={copy}
        className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors ${
          copied
            ? "bg-[color-mix(in_srgb,var(--accent-green)_16%,transparent)] text-[var(--accent-green-text)]"
            : "bg-[var(--accent-green)] text-white hover:opacity-90"
        }`}
      >
        {copied ? "Copied" : "Copy invite"}
      </button>
    </div>
  );
}
