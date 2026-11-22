import { useState } from "react";
import { useDismissOnEscape } from "../hooks/useDismissOnEscape";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { CheckIcon, ChevronDownIcon } from "./icons";

const options = (short: string) =>
  [
    { draft: false, label: `Create ${short}`, detail: "Ready for review" },
    { draft: true, label: `Create draft ${short}`, detail: "Not ready yet; reviewers aren't asked" },
  ] as const;

interface CreatePRSplitButtonProps {
  // "PR", or "MR" on GitLab.
  short?: string;
  draft: boolean;
  busy: boolean;
  disabled: boolean;
  onCreate: (draft: boolean) => void;
}

// Creates the PR the way it was last made; the chevron picks ready or draft.
export function CreatePRSplitButton({ short = "PR", draft, busy, disabled, onCreate }: CreatePRSplitButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setMenuOpen(false), menuOpen);
  useDismissOnEscape(menuOpen, () => setMenuOpen(false));

  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        onClick={() => onCreate(draft)}
        disabled={disabled}
        className="rounded-l-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
      >
        {busy ? "Creating..." : draft ? `Create draft ${short}` : `Create ${short}`}
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={disabled}
        aria-label={`Choose how to create the ${short}`}
        aria-expanded={menuOpen}
        className="rounded-r-lg border-l border-[var(--bg-primary)]/20 bg-[var(--text-primary)] px-1.5 py-1.5 text-[var(--bg-primary)]/70 transition-all hover:text-[var(--bg-primary)] hover:opacity-90 disabled:opacity-30"
      >
        <ChevronDownIcon />
      </button>
      {menuOpen && (
        <div className="absolute bottom-full right-0 z-10 mb-1 w-64 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
          {options(short).map((opt) => (
            <button
              type="button"
              key={opt.label}
              onClick={() => {
                setMenuOpen(false);
                onCreate(opt.draft);
              }}
              className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="mt-0.5 flex w-3 shrink-0 justify-center text-[var(--text-primary)]">
                {opt.draft === draft && <CheckIcon />}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-[var(--text-primary)]">{opt.label}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">{opt.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
