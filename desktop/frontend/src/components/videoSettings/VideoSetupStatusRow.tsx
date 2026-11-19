import { useEffect } from "react";
import { Check } from "lucide-react";
import { openVideoSetup, refreshVideoSetup, useVideoSetup } from "../../store/videoSetup";
import { isVideoSetUp, videoSetupRows } from "../../videoSetup";
import { SettingsRow } from "../SettingsRow";
import { BTN_SECONDARY } from "../ui/buttons";

const BUTTON = { installing: "Show", ready: "Check again", missing: "Set up…" } as const;

// Whether this Mac has everything a video needs, with the setup window one
// click away for what it lacks.
export function VideoSetupStatusRow() {
  const parts = useVideoSetup((s) => s.parts);
  const running = useVideoSetup((s) => s.running);

  // A Mac found ready stays ready, as the Video button treats it; Check again
  // looks anew.
  useEffect(() => {
    const known = useVideoSetup.getState().parts;
    if (!known || !isVideoSetUp(known)) void refreshVideoSetup();
  }, []);

  const missing = parts ? videoSetupRows(parts).filter((p) => !p.ready).length : 0;
  const state = running ? "installing" : !parts ? "checking" : missing === 0 ? "ready" : "missing";

  return (
    <SettingsRow label="Setup" description="The explaincast skill and the tools a video is recorded with">
      <div className="flex items-center gap-3">
        {state === "ready" ? (
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Check size={14} className="text-[var(--accent-green)]" />
            All ready
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">
            {state === "installing"
              ? "Installing…"
              : state === "checking"
                ? "Checking…"
                : `${missing} ${missing === 1 ? "part" : "parts"} to install`}
          </span>
        )}
        {state !== "checking" && (
          <button
            type="button"
            onClick={() => (state === "ready" ? void refreshVideoSetup() : openVideoSetup())}
            className={BTN_SECONDARY}
          >
            {BUTTON[state]}
          </button>
        )}
      </div>
    </SettingsRow>
  );
}
