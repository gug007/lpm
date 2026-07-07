import { useState } from "react";
import { TerminalIcon } from "./icons";
import { TerminalClaimControl } from "../../bridge/commands";
import { REALM } from "../mirror";

// A terminal is rendered live (and drives the single shared PTY size) in exactly
// one place at a time. When another surface — the main/detached window, or a
// paired phone — currently owns it, this window shows this placeholder instead
// of a second, mis-sized copy. "Take control" moves ownership here; Rust then
// flips the previous owner to its own placeholder.
export function TerminalHandoffPlaceholder({
  terminalId,
  ownerLabel,
}: {
  terminalId: string;
  ownerLabel: string;
}) {
  const [taking, setTaking] = useState(false);
  const takeControl = () => {
    setTaking(true);
    TerminalClaimControl(terminalId, REALM.kind, REALM.id, REALM.label).catch(
      () => setTaking(false),
    );
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-[var(--terminal-bg)] px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
        <TerminalIcon />
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium text-[var(--text-primary)]">
          Active in {ownerLabel}
        </div>
        <div className="max-w-xs text-xs text-[var(--text-muted)]">
          This terminal is shown and controlled elsewhere to keep it sized
          correctly. Take control to move it here.
        </div>
      </div>
      <button
        type="button"
        onClick={takeControl}
        disabled={taking}
        className="rounded-md border border-[var(--accent-cyan)] px-3 py-1.5 text-xs font-medium text-[var(--accent-cyan)] transition-colors hover:bg-[var(--accent-cyan)] hover:text-[var(--terminal-bg)] disabled:opacity-50"
      >
        {taking ? "Taking control…" : "Take control"}
      </button>
    </div>
  );
}
