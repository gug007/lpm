import { insertDefault } from "../instructionSources";
import { BTN_SECONDARY } from "./ui/buttons";

interface InstructionsDefaultActionsProps {
  content: string;
  // lpm's built-in instructions.
  defaultText: string;
  // Resetting a project's instructions clears them, so the global ones apply;
  // resetting the global ones restores the built-in text.
  resetClears?: boolean;
  onChange: (content: string) => void;
}

export function InstructionsDefaultActions({
  content,
  defaultText,
  resetClears = false,
  onChange,
}: InstructionsDefaultActionsProps) {
  const resetText = resetClears ? "" : defaultText;
  const canInsert = !content.includes(defaultText.trim());
  const canReset = content.trim() !== resetText.trim();
  if (!canInsert && !canReset) return null;
  return (
    <div className="flex items-center gap-1.5">
      {canInsert && (
        <button
          type="button"
          onClick={() => onChange(insertDefault(content, defaultText))}
          title="Add lpm's built-in instructions to edit from"
          className={BTN_SECONDARY}
        >
          Insert default
        </button>
      )}
      {canReset && (
        <button
          type="button"
          onClick={() => onChange(resetText)}
          title={
            resetClears
              ? "Clear these instructions so the global ones apply"
              : "Replace with lpm's built-in instructions"
          }
          className={BTN_SECONDARY}
        >
          {resetClears ? "Use global" : "Reset to default"}
        </button>
      )}
    </div>
  );
}
