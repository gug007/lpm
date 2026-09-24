import { History, Mic } from "lucide-react";

export default function DialogPromptBox({
  text,
  placeholder,
}: {
  text?: string;
  placeholder: string;
}) {
  return (
    <div className="menu-pop mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
      <p
        className={`min-h-[3.25rem] px-3 py-2.5 text-[13px] leading-snug ${
          text ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
        }`}
      >
        {text ?? placeholder}
      </p>
      <div aria-hidden className="flex items-center gap-1 px-2 pb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)]">
          <Mic className="h-3.5 w-3.5" />
        </span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)]">
          <History className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}
