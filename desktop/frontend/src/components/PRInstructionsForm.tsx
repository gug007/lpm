import type { KeyboardEvent } from "react";
import { useYamlEditor } from "../hooks/useYamlEditor";
import {
  DEFAULT_PR_TITLE_INSTRUCTIONS,
  DEFAULT_PR_DESCRIPTION_INSTRUCTIONS,
} from "../aiInstructions";
import { hasPrimaryMod } from "../keyEvents";
import { InstructionsCard } from "./InstructionsCard";
import { EditorSaveBar } from "./EditorSaveBar";
import { CARD_CLASS } from "./ui/fields";

interface PRInstructionsFormProps {
  titleLoad: () => Promise<string>;
  titleSave: (content: string) => Promise<void>;
  descLoad: () => Promise<string>;
  descSave: (content: string) => Promise<void>;
  // A project's reset clears its texts so the global ones apply again.
  resetClears?: boolean;
}

export function PRInstructionsForm({
  titleLoad,
  titleSave,
  descLoad,
  descSave,
  resetClears,
}: PRInstructionsFormProps) {
  const title = useYamlEditor(titleLoad, titleSave);
  const desc = useYamlEditor(descLoad, descSave);

  const handleSave = async () => {
    await Promise.all([
      title.dirty ? title.handleSave() : undefined,
      desc.dirty ? desc.handleSave() : undefined,
    ]);
  };

  const handleSaveKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key.toLowerCase() === "s" && hasPrimaryMod(e)) {
      e.preventDefault();
      void handleSave();
    }
  };

  return (
    <div className="-mx-1 mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-4">
      <div className={`${CARD_CLASS} divide-y divide-[var(--border)]`}>
        <InstructionsCard
          bare
          label="Title"
          content={title.content}
          defaultText={DEFAULT_PR_TITLE_INSTRUCTIONS}
          resetClears={resetClears}
          minRows={2}
          onChange={title.setContent}
          onKeyDown={handleSaveKey}
        />
        <InstructionsCard
          bare
          label="Description"
          content={desc.content}
          defaultText={DEFAULT_PR_DESCRIPTION_INSTRUCTIONS}
          resetClears={resetClears}
          minRows={2}
          onChange={desc.setContent}
          onKeyDown={handleSaveKey}
        />
      </div>
      <EditorSaveBar
        dirty={title.dirty || desc.dirty}
        saving={title.saving || desc.saving}
        error={title.error || desc.error}
        onSave={handleSave}
      />
    </div>
  );
}
