import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { PasteInviteField } from "./PasteInviteField";
import { Row } from "./GroupedList";

const FIELD_CLASS =
  "rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]";

// Both ways in to another Mac, in the order people reach for them: paste the
// invite you were sent, or — when the invite couldn't make the trip — type what
// it contained.
export function AddMacPanel({
  busy,
  onInvite,
  onManual,
}: {
  busy: boolean;
  onInvite: (raw: string) => void;
  onManual: (address: string, port: number, code: string) => Promise<boolean>;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("8766");
  const [code, setCode] = useState("");

  const canSubmit = address.trim().length > 0 && code.trim().length > 0 && !busy;
  const submit = async () => {
    if (!canSubmit) return;
    if (await onManual(address.trim(), Number(port) || 8766, code.trim())) {
      setAddress("");
      setCode("");
      setPort("8766");
    }
  };

  return (
    <>
      <div className="px-4 py-3">
        <PasteInviteField busy={busy} onConnect={onInvite} />
      </div>

      <button
        type="button"
        onClick={() => setManualOpen((v) => !v)}
        aria-expanded={manualOpen}
        className="flex w-full items-center px-4 py-3 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <span className="flex-1">Enter details manually</span>
        <ChevronRight
          size={14}
          className={`text-[var(--text-muted)] transition-transform ${manualOpen ? "rotate-90" : ""}`}
        />
      </button>

      {manualOpen && (
        <>
          <Row>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address"
              className={`${FIELD_CLASS} min-w-0 flex-1`}
            />
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="Port"
              inputMode="numeric"
              className={`${FIELD_CLASS} w-20 shrink-0 tabular-nums`}
            />
          </Row>
          <Row>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Pairing code"
              className={`${FIELD_CLASS} min-w-0 flex-1 font-mono tracking-widest`}
            />
            <button
              onClick={() => void submit()}
              disabled={!canSubmit}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                canSubmit
                  ? "bg-[var(--accent-cyan)] text-white hover:opacity-90"
                  : "bg-[var(--bg-active)] text-[var(--text-muted)]"
              }`}
            >
              Connect
            </button>
          </Row>
        </>
      )}
    </>
  );
}
