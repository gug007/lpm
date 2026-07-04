import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { useAutoGrowTextarea } from "../hooks/useAutoGrowTextarea";

interface ComposerVariantsModalProps {
  open: boolean;
  // The action that produced the rewrites, shown for context in the header.
  actionLabel: string;
  variants: string[];
  // Apply the chosen (possibly edited) text to the composer.
  onChoose: (text: string) => void;
  onClose: () => void;
}

// Shown when an action was asked for more than one result: lists every rewrite
// as an editable field so the user can tweak any of them before committing one
// back into the composer.
export function ComposerVariantsModal({
  open,
  actionLabel,
  variants,
  onChoose,
  onClose,
}: ComposerVariantsModalProps) {
  const [drafts, setDrafts] = useState<string[]>(variants);

  // Reseed editable copies whenever a fresh batch opens; edits are discarded on
  // close so a later batch never inherits stale text. Pre-paint (layout effect)
  // so a reopen never flashes the previous batch's drafts for a frame.
  useLayoutEffect(() => {
    if (open) setDrafts(variants);
  }, [open, variants]);

  const choose = (i: number) => {
    const text = (drafts[i] ?? "").trim();
    if (!text) return;
    onChoose(text);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/60 backdrop-blur-sm"
      contentClassName="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
      zIndexClassName="z-[70]"
    >
      <div className="flex max-h-[80vh] w-[min(680px,calc(100vw-32px))] flex-col">
        <header className="flex items-start gap-3 px-6 pb-3 pt-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
            <Sparkles size={17} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
              Choose a variant
            </h2>
            <p className="mt-1 text-[12.5px] leading-5 text-[var(--text-muted)]">
              {drafts.length} rewrites from{" "}
              <span className="text-[var(--text-secondary)]">{actionLabel || "your action"}</span>. Edit
              any of them, then pick the one to use.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1 shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <XIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 py-1">
          {drafts.map((text, i) => (
            <VariantCard
              key={i}
              index={i}
              value={text}
              onChange={(next) => setDrafts((d) => d.map((t, j) => (j === i ? next : t)))}
              onUse={() => choose(i)}
            />
          ))}
        </div>

        <footer className="flex justify-end px-6 pb-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
        </footer>
      </div>
    </Modal>
  );
}

interface VariantCardProps {
  index: number;
  value: string;
  onChange: (next: string) => void;
  onUse: () => void;
}

function VariantCard({ index, value, onChange, onUse }: VariantCardProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoGrowTextarea(ref, value, 240);
  const canUse = value.trim().length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onUse();
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/50 transition-colors focus-within:border-[var(--accent-cyan)]/50">
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Variant {index + 1}
        </span>
        <button
          type="button"
          onClick={onUse}
          disabled={!canUse}
          title="Use this rewrite  ·  ⌘↵"
          className="rounded-md bg-[var(--accent-cyan)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          Use this
        </button>
      </div>
      <textarea
        ref={ref}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        className="block w-full resize-none bg-transparent px-3 pb-2.5 pt-1.5 text-[12.5px] leading-relaxed text-[var(--text-primary)] outline-none"
      />
    </div>
  );
}
