import { Modal } from "./ui/Modal";

export interface Pairing {
  code: string;
  url: string;
  svg: string | null;
  host: string;
  hosts: string[];
  port: number;
}

export function PairingModal({
  pairing,
  machine,
  onClose,
}: {
  pairing: Pairing | null;
  // Names the machine the QR pairs with when it isn't this Mac (a connected
  // host minted the code; the phone will talk to it directly).
  machine?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={pairing !== null}
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[420px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl"
    >
      {pairing && (
        <>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {machine ? `Pair a device with ${machine}` : "Pair a device"}
          </h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            In the lpm mobile app, tap Add device and scan this code. It works once and expires
            after a device pairs.
            {machine ? " The phone connects straight to that machine, so it keeps working while this Mac is off." : ""}
          </p>
          <div className="mt-4 flex flex-col items-center gap-3">
            {pairing.svg ? (
              <div
                className="rounded-lg bg-white p-3"
                // The Rust side builds the QR as a self-contained SVG string.
                dangerouslySetInnerHTML={{ __html: pairing.svg }}
              />
            ) : (
              <div className="text-[11px] text-[var(--text-muted)]">QR unavailable — enter the code manually.</div>
            )}
            <div className="text-center">
              <p className="font-mono text-lg tracking-widest text-[var(--text-primary)]">{pairing.code}</p>
              <div className="mt-1 space-y-0.5">
                {(pairing.hosts?.length ? pairing.hosts : [pairing.host]).map((h) => (
                  <p key={h} className="font-mono text-[11px] text-[var(--text-muted)]">
                    {h}:{pairing.port}
                  </p>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
            >
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
