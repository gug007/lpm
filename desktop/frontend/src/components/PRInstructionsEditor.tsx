import {
  ReadPRTitleInstructions,
  SavePRTitleInstructions,
  ReadPRDescriptionInstructions,
  SavePRDescriptionInstructions,
} from "../../bridge/commands";
import { PRInstructionsForm } from "./PRInstructionsForm";
import { ChevronLeftIcon } from "./icons";
import {
  DEFAULT_PR_TITLE_INSTRUCTIONS,
  DEFAULT_PR_DESCRIPTION_INSTRUCTIONS,
  withDefault,
} from "../aiInstructions";

const titleLoad = withDefault(ReadPRTitleInstructions, DEFAULT_PR_TITLE_INSTRUCTIONS);
const descLoad = withDefault(ReadPRDescriptionInstructions, DEFAULT_PR_DESCRIPTION_INSTRUCTIONS);

export function PRInstructionsEditor({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col pt-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Back to Settings"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">PR Instructions</h1>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        Custom instructions for AI-generated pull request titles and descriptions. Applied globally to all projects.
      </p>

      <PRInstructionsForm
        titleLoad={titleLoad}
        titleSave={SavePRTitleInstructions}
        descLoad={descLoad}
        descSave={SavePRDescriptionInstructions}
      />
    </div>
  );
}
