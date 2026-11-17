import { SlidersHorizontal } from "lucide-react";
import { StatusLineSection } from "./StatusLineSection";
import { BTN_SECONDARY } from "./ui/buttons";
import { CARD_CLASS } from "./ui/fields";

// Where the builder goes while no lpm layout is chosen: one way in, instead of
// a builder that edits nothing yet.
export function StatusLineBuildPrompt({
  ownLine,
  disabled,
  onBuild,
}: {
  ownLine: boolean;
  disabled: boolean;
  onBuild: () => void;
}) {
  return (
    <StatusLineSection
      title="Arrange your items"
      description="Pick, order and style each item of the line yourself."
    >
      <div className={`${CARD_CLASS} flex items-center gap-3 px-4 py-3.5`}>
        <SlidersHorizontal aria-hidden size={16} className="shrink-0 text-[var(--text-muted)]" />
        <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {ownLine
            ? "Your own status line is in use. Building one here replaces it."
            : "The status line is off. Build your own to choose what it shows."}
        </p>
        <button type="button" onClick={onBuild} disabled={disabled} className={BTN_SECONDARY}>
          Build your own
        </button>
      </div>
    </StatusLineSection>
  );
}
