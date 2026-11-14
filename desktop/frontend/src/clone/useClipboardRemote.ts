import { useEffect, useState } from "react";
import { ReadClipboardText } from "../../bridge/commands";
import { useCloneOffer } from "./cloneOffer";
import { parseGitRemote, type GitRemote } from "./gitRemote";

// The Git remote on the clipboard, unless the user already waved it off. Read
// through the app (never navigator.clipboard, which can prompt) when the
// screen mounts and each time the window comes back to the front.
export function useClipboardRemote(): GitRemote | null {
  const dismissed = useCloneOffer((s) => s.dismissed);
  const [remote, setRemote] = useState<GitRemote | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const raw: unknown = await ReadClipboardText();
        if (alive) setRemote(parseGitRemote(typeof raw === "string" ? raw : ""));
      } catch {
        /* no clipboard to read: keep whatever was offered */
      }
    };
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return remote && !dismissed.includes(remote.url) ? remote : null;
}
