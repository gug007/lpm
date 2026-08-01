import type { RemoteToneStyle } from "../remoteStatus";

/** A short explanation the pane puts under whatever it is about — the Mac's own
 *  words about why something didn't happen. Tinted from the status tone so it
 *  reads the same in light and dark. */
export function RemoteNotice({
  tone,
  children,
}: {
  tone: RemoteToneStyle;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="mt-3 rounded-xl border px-4 py-3"
      style={{ borderColor: tone.border, backgroundColor: tone.surface }}
    >
      <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{children}</p>
    </div>
  );
}
