import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { GetVersion, GetPlatform } from "../../wailsjs/go/main/App";
import { XIcon, ChevronLeftIcon } from "./icons";

interface FeedbackModalProps {
  onClose: () => void;
}

const KINDS = [
  {
    value: "bug",
    emoji: "\u{1F41E}",
    title: "Bug",
    description: "Something isn't working as expected",
    label: "bug",
    template:
      "**What happened?**\n\n\n**Steps to reproduce**\n1. \n2. \n3. \n\n**Expected**\n\n\n**Actual**\n",
    titleHint: "Short summary of the bug",
  },
  {
    value: "suggestion",
    emoji: "\u{1F4A1}",
    title: "Suggestion",
    description: "Ideas, improvements",
    label: "enhancement",
    template:
      "**What would you like to see?**\n\n\n**Why is it useful?**\n",
    titleHint: "One-line summary of the idea",
  },
  {
    value: "question",
    emoji: "\u2753",
    title: "Question",
    description: "Ask about how something works",
    label: "question",
    template: "**What would you like to know?**\n",
    titleHint: "Your question in one line",
  },
] as const;

type Kind = (typeof KINDS)[number];

const REPO = "gug007/lpm";

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState("");

  useEffect(() => {
    GetVersion().then(setVersion).catch(() => setVersion(""));
    GetPlatform().then(setPlatform).catch(() => setPlatform(""));
  }, []);

  const handlePick = (k: Kind) => {
    setKind(k);
    setBody(k.template);
  };

  const handleSubmit = () => {
    if (!kind) return;
    const footer = `\n\n---\nlpm ${version || "dev"} \u00B7 ${platform || navigator.platform}`;
    const params = new URLSearchParams({
      title: title.trim(),
      body: body + footer,
      labels: kind.label,
    });
    BrowserOpenURL(`https://github.com/${REPO}/issues/new?${params.toString()}`);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      contentClassName="w-[580px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
    >
      <div className="relative flex items-center justify-center px-6 pb-4 pt-6">
        {kind && (
          <button
            onClick={() => setKind(null)}
            className="absolute left-4 top-5 flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Back"
          >
            <ChevronLeftIcon />
          </button>
        )}
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          {kind ? `Send ${kind.title.toLowerCase()}` : "How can we help?"}
        </h3>
        <button
          onClick={onClose}
          className="absolute right-4 top-5 flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Close"
        >
          <XIcon />
        </button>
      </div>

      {!kind && (
        <div className="flex flex-col gap-2 px-6 pb-6">
          {KINDS.map((k) => (
            <button
              key={k.value}
              onClick={() => handlePick(k)}
              className="flex items-start gap-3 rounded-lg border border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="text-xl leading-none">{k.emoji}</span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {k.title}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {k.description}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {kind && (
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={kind.titleHint}
              className="w-full border-b border-[var(--border)] bg-transparent px-0.5 pb-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              Details
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={12}
              className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5 font-mono text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
            />
          </div>

          <p className="text-[11px] text-[var(--text-muted)]">
            Opens a prefilled issue on GitHub. You'll need an account to submit.
          </p>

          <div className="flex items-center justify-between">
            <div className="text-[11px] text-[var(--text-muted)]">
              <kbd className="font-mono">{"\u2318\u21B5"}</kbd> Open in GitHub
              <span className="mx-1.5">{"\u00B7"}</span>
              <kbd className="font-mono">Esc</kbd> Cancel
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!title.trim()}
                className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
              >
                Open in GitHub
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
