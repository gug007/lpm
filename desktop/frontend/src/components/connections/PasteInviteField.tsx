import { useState } from "react";
import { decodeInvite } from "../../peer/invite";
import { decodeShareInvite } from "../../share/invite";
import { useTabShares } from "../../store/tabShares";
import { MACHINE } from "../../machineWords";
import { BTN_PRIMARY } from "../ui/buttons";

// The primary way to connect: paste one invite string. The field recognizes a
// valid invite as you paste — a quiet accent edge + inline check + accent-filled
// Connect — and Enter (or Connect) submits. Invalid text gets a plain-language
// nudge, never jargon. Sits inside a grouped-list row.
export function PasteInviteField({
  busy,
  onConnect,
}: {
  busy: boolean;
  // Resolves false when the connection failed, which keeps the invite here to retry.
  onConnect: (invite: string) => Promise<boolean> | void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  // A shared tab's invite opens that tab rather than pairing the machine.
  const shared = trimmed ? decodeShareInvite(trimmed) : null;
  const decoded = trimmed && !shared ? decodeInvite(trimmed) : null;
  const valid = !!decoded || !!shared;
  const invalid = trimmed.length > 0 && !valid;
  const canConnect = valid && !busy;

  const submit = () => {
    if (!canConnect) return;
    if (shared) {
      useTabShares.getState().openJoinDialog(trimmed);
      setValue("");
      return;
    }
    void Promise.resolve(onConnect(trimmed)).then((ok) => {
      if (ok !== false) setValue("");
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Paste invite from ${MACHINE.otherMachine}`}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className={`w-full rounded-lg border bg-[var(--bg-primary)] px-3 py-1.5 pr-8 text-[13px] text-[var(--text-primary)] outline-none transition-colors ${
              valid
                ? "border-[var(--accent-green)]"
                : invalid
                  ? "border-[color-mix(in_srgb,var(--accent-red)_45%,var(--border))]"
                  : "border-[var(--border)] focus:border-[var(--text-muted)]"
            }`}
          />
          {valid && (
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--accent-green-text)]"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <button
          onClick={submit}
          disabled={!canConnect}
          className={`shrink-0 ${BTN_PRIMARY}`}
        >
          {shared ? "Join" : busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      {(valid || invalid) && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {shared
            ? "An invite to a shared tab. Join to open it."
            : decoded
            ? `Ready to connect to ${decoded.hosts[0]}.`
            : "That isn't a complete invite — paste the whole thing, or enter details manually."}
        </p>
      )}
    </div>
  );
}
