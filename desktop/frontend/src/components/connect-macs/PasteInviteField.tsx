import { useState } from "react";
import { decodeInvite } from "../../peer/invite";

// The primary way to connect: paste one invite string. The field recognizes a
// valid invite as you paste — a quiet accent edge + inline check + accent-filled
// Connect — and Enter (or Connect) submits. Invalid text gets a plain-language
// nudge, never jargon. Sits inside a grouped-list row.
export function PasteInviteField({
  busy,
  onConnect,
}: {
  busy: boolean;
  onConnect: (invite: string) => void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const decoded = trimmed ? decodeInvite(trimmed) : null;
  const invalid = trimmed.length > 0 && !decoded;
  const canConnect = !!decoded && !busy;

  const submit = () => {
    if (!canConnect) return;
    onConnect(trimmed);
    setValue("");
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
            placeholder="Paste invite from the other Mac"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className={`w-full rounded-lg border bg-[var(--bg-primary)] px-3 py-1.5 pr-8 text-[13px] text-[var(--text-primary)] outline-none transition-colors ${
              decoded
                ? "border-[var(--accent-cyan)]"
                : invalid
                  ? "border-[color-mix(in_srgb,var(--accent-red)_45%,var(--border))]"
                  : "border-[var(--border)] focus:border-[var(--accent-cyan)]"
            }`}
          />
          {decoded && (
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--accent-cyan)]"
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
          className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
            canConnect
              ? "bg-[var(--accent-cyan)] text-white hover:opacity-90"
              : "bg-[var(--bg-active)] text-[var(--text-muted)]"
          }`}
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      {(decoded || invalid) && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {decoded
            ? `Ready to connect to ${decoded.hosts[0]}.`
            : "That isn't a complete invite — paste the whole thing, or enter details manually."}
        </p>
      )}
    </div>
  );
}
