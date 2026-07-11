import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy"
      className="group flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-hover)] px-2 py-1.5 text-left font-mono text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--text-muted)]"
    >
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">{value}</span>
      <span className="shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]">
        {copied ? <CheckIcon /> : <CopyIcon size={12} />}
      </span>
    </button>
  );
}

function Entry({ label, sentence, command }: { label: string; sentence: string; command: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</p>
      <p>{sentence}</p>
      <CopyChip value={command} />
    </div>
  );
}

export function AgentToolsManualSetup() {
  return (
    <div className="mt-2 space-y-2.5 border-t border-[var(--border)] pt-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Manual setup</p>
      <Entry
        label="Skills"
        sentence="Written to ~/.claude and ~/.agents. Re-run Install to update, or remove them with:"
        command="rm -rf ~/.claude/skills/lpm-{config,cli} ~/.agents/skills/lpm-{config,cli}"
      />
      <Entry
        label="Command line"
        sentence="Link the lpm command yourself; app updates follow the symlink automatically:"
        command="ln -sf /Applications/lpm.app/Contents/MacOS/lpm-cli /usr/local/bin/lpm"
      />
    </div>
  );
}
