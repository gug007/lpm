import { useState } from "react";
import {
  modalErrorInputClass,
  modalErrorTextClass,
  modalInputClass,
  modalInputDefaults,
} from "../forms/styles";
import { Modal } from "./ui/Modal";

const SUGGESTIONS = ["Work", "Personal", "Client"];

interface ClaudeAddAccountModalProps {
  // Names already in use, so a new account can't be mistaken for one of them.
  takenNames: string[];
  onClose: () => void;
  onAdd: (label: string) => Promise<void>;
}

/** Names a new Claude account; signing in to it comes right after. */
export function ClaudeAddAccountModal({ takenNames, onClose, onAdd }: ClaudeAddAccountModalProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const isTaken = (label: string) => takenNames.some((n) => n.toLowerCase() === label.toLowerCase());
  const trimmed = name.trim();
  const taken = isTaken(trimmed);
  const canAdd = trimmed.length > 0 && !taken && !saving;
  const suggestions = SUGGESTIONS.filter((s) => !isTaken(s));

  const submit = async () => {
    if (!canAdd) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[380px] max-w-[92vw] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Add a Claude account</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Give it a name you'll recognize. You'll sign in to Claude next, in a terminal.
        </p>
        <label htmlFor="claude-account-name" className="mt-4 block text-[11px] font-medium text-[var(--text-secondary)]">
          Name
        </label>
        <input
          id="claude-account-name"
          autoFocus
          {...modalInputDefaults}
          value={name}
          placeholder="e.g. Work"
          onChange={(e) => setName(e.target.value)}
          className={`mt-1.5 ${modalInputClass} ${taken ? modalErrorInputClass : ""}`}
        />
        {taken ? (
          <p className={`mt-1.5 ${modalErrorTextClass}`}>You already have an account named {trimmed}.</p>
        ) : (
          suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setName(suggestion)}
                  className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canAdd}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add and sign in"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
