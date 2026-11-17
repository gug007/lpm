import type { LucideIcon } from "lucide-react";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { InstructionsCard } from "./InstructionsCard";
import { PageHeader } from "./ui/PageHeader";
import { EditorSaveBar } from "./EditorSaveBar";

interface InstructionsEditorProps {
  title: string;
  icon?: LucideIcon;
  description: string;
  defaultText: string;
  resetClears?: boolean;
  load: () => Promise<string>;
  save: (content: string) => Promise<void>;
  onBack: () => void;
  backTitle?: string;
}

export function InstructionsEditor({
  title,
  icon,
  description,
  defaultText,
  resetClears,
  load,
  save,
  onBack,
  backTitle = "Settings",
}: InstructionsEditorProps) {
  const { content, setContent, dirty, saving, error, handleSave, handleSaveKey } =
    useYamlEditor(load, save);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={icon}
        title={title}
        description={description}
        back={{ label: backTitle, onClick: onBack }}
      />
      <div className="-mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        <InstructionsCard
          label="Instructions"
          content={content}
          defaultText={defaultText}
          resetClears={resetClears}
          minRows={4}
          onChange={setContent}
          onKeyDown={handleSaveKey}
        />
        <EditorSaveBar dirty={dirty} saving={saving} error={error} onSave={handleSave} />
      </div>
    </div>
  );
}
