import { useEffect, useState } from "react";
import { KeepAwakeLid, PeerInvoke } from "../../bridge/commands";
import { isMac } from "../platform";

const GENERAL = isMac
  ? "Closing the lid still puts it to sleep, unless a display is connected."
  : "Closing a laptop's lid follows its power settings.";

// A display plugged in or out while the menu is open shows up this soon.
const REREAD_MS = 5_000;

type Lid = "none" | "sleeps" | "stays" | "unknown";

function readLid(raw: unknown): Lid {
  const lid = ((raw ?? {}) as Record<string, unknown>).lid;
  return lid === "none" || lid === "sleeps" || lid === "stays" ? lid : "unknown";
}

// The bottom of the Keep awake menu: on a Mac that can say, a warning while
// closing the lid would end Keep awake, word that it's fine while an external
// display and power keep it going, and nothing on a Mac without a lid.
// Anywhere else, and on a connected computer whose lpm can't say, the general
// sentence.
export function KeepAwakeLidNote({ slug, on }: { slug: string | null; on: boolean }) {
  const [lid, setLid] = useState<Lid | null>(null);

  useEffect(() => {
    let live = true;
    const read = () =>
      (slug ? PeerInvoke(slug, "keep_awake_lid", {}) : KeepAwakeLid()).then(
        (raw: unknown) => live && setLid(readLid(raw)),
        () => live && setLid("unknown"),
      );
    void read();
    const timer = window.setInterval(() => void read(), REREAD_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [slug]);

  if (!lid || lid === "none") return null;
  if (lid === "unknown") {
    return <p className="px-3 pt-0.5 text-[10.5px] leading-snug text-[var(--text-muted)]">{GENERAL}</p>;
  }
  if (!on) return null;

  const fine = lid === "stays";
  return (
    <p
      className={`mx-2 mb-0.5 mt-1 flex items-start gap-[7px] rounded-md px-2 py-1.5 text-[11px] leading-snug ${
        fine
          ? "bg-[var(--accent-green)]/12 text-[var(--accent-green-text)]"
          : "bg-[var(--accent-amber)]/15 text-[var(--accent-amber-text)]"
      }`}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="mt-px shrink-0"
      >
        {fine ? (
          <>
            <rect width="20" height="14" x="2" y="3" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </>
        ) : (
          <>
            <path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z" />
            <path d="M20.054 15.987H3.946" />
          </>
        )}
      </svg>
      {fine ? "Display and power connected: you can close the lid." : "Closing the lid will put it to sleep."}
    </p>
  );
}
