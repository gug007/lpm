import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { PasteInviteField } from "./PasteInviteField";
import { Row } from "./GroupedList";
import { BTN_PRIMARY } from "../ui/buttons";
import { FIELD_CLASS } from "./fieldClass";

// Both ways in to another Mac, in the order people reach for them: paste the
// invite you were sent, or — when the invite couldn't make the trip — type what
// it contained.
export function AddMacPanel({
  busy,
  onInvite,
  onManual,
}: {
  busy: boolean;
  // Resolves false when the connection failed, which keeps the invite in the field.
  onInvite: (raw: string) => Promise<boolean> | void;
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
              className={`shrink-0 ${BTN_PRIMARY}`}
            >
              Connect
            </button>
          </Row>
        </>
      )}
    </>
  );
}
