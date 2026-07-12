import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function ToastCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard write can fail outside a user gesture; ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title="Copy"
      aria-label="Copy error"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: 24,
        height: 24,
        padding: 0,
        marginTop: 4,
        border: "none",
        borderRadius: 4,
        background: "transparent",
        color: "currentColor",
        cursor: "pointer",
        opacity: 0.8,
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
