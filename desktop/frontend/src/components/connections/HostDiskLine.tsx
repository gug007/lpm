import { useEffect, useState } from "react";
import { PeerInvoke } from "../../../bridge/commands";
import { diskSummary, isLow, parseDiskSpace, type DiskSpace } from "../../diskSpace";

// A server fills up over hours, not seconds.
const EVERY_MS = 5 * 60_000;

/** A connected host's free disk space under its status line, amber when low.
 *  Nothing shows while it's offline or when its lpm is too old to say. */
export function HostDiskLine({ slug, connected }: { slug: string; connected: boolean }) {
  const [disk, setDisk] = useState<DiskSpace | null>(null);

  useEffect(() => {
    setDisk(null);
    if (!connected) return;
    let current = true;
    const load = () =>
      PeerInvoke(slug, "machine_disk_space", {})
        .then((d) => current && setDisk(parseDiskSpace(d)))
        .catch(() => {});
    void load();
    const timer = window.setInterval(load, EVERY_MS);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [slug, connected]);

  if (!disk) return null;
  return (
    <p
      className={`truncate text-[11px] ${
        isLow(disk) ? "text-[var(--accent-amber-text)]" : "text-[var(--text-muted)]"
      }`}
    >
      {diskSummary(disk)}
    </p>
  );
}
