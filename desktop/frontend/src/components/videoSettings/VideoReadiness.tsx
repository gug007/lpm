import { useEffect } from "react";
import { Folder } from "lucide-react";
import { OpenPathInDefaultApp } from "../../../bridge/commands";
import { toast } from "../../notifications/toast";
import type { VideoNarrator } from "../../store/settings";
import { openVideoSetup, refreshVideoSetup, useVideoSetup } from "../../store/videoSetup";
import { shortPath } from "../../toolkit";
import { isVideoSetUp, videoSetupRows } from "../../videoSetup";

type Tone = "ok" | "warn" | "wait";

const DOT: Record<Tone, string> = {
  ok: "bg-[var(--accent-green)]",
  warn: "bg-[var(--accent-amber)]",
  wait: "bg-[var(--text-muted)]",
};

const LINK =
  "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

// The window's footer line: whether the next video will work, with the setup
// window one click away when it won't, and the videos folder beside it.
export function VideoReadiness({
  narrator,
  keySaved,
  videosDir,
}: {
  narrator: VideoNarrator;
  keySaved: boolean | null;
  videosDir: string | null;
}) {
  const parts = useVideoSetup((s) => s.parts);
  const running = useVideoSetup((s) => s.running);

  // A Mac found ready stays ready, as the Video button treats it.
  useEffect(() => {
    const known = useVideoSetup.getState().parts;
    if (!known || !isVideoSetUp(known)) void refreshVideoSetup();
  }, []);

  const missing = parts ? videoSetupRows(parts).filter((p) => !p.ready).length : 0;
  const [tone, text, action]: [Tone, string, string | null] = running
    ? ["wait", "Installing…", "Show"]
    : !parts
      ? ["wait", "Checking…", null]
      : missing > 0
        ? ["warn", `${missing} ${missing === 1 ? "part" : "parts"} to install`, "Set up…"]
        : narrator === "openai" && keySaved === false
          ? ["warn", "Add a key to use the cloud voice", null]
          : ["ok", "Ready to record", null];

  const openFolder = () => {
    if (!videosDir) return;
    OpenPathInDefaultApp(videosDir).catch((err: unknown) =>
      toast.error("Couldn't open the videos folder", { description: String(err) }),
    );
  };

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span aria-hidden className={`h-[7px] w-[7px] shrink-0 rounded-full ${DOT[tone]}`} />
      <span role="status" className="truncate">
        {text}
      </span>
      {action && (
        <button type="button" onClick={() => openVideoSetup()} className={`${LINK} font-medium text-[var(--text-primary)]`}>
          {action}
        </button>
      )}
      {videosDir && (
        <>
          <span aria-hidden className="text-[var(--text-muted)]">
            ·
          </span>
          <button type="button" onClick={openFolder} title={shortPath(videosDir)} className={LINK}>
            <Folder aria-hidden size={13} />
            Videos folder
          </button>
        </>
      )}
    </div>
  );
}
