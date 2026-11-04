import { useCallback, useState } from "react";
import type * as monacoNs from "monaco-editor";
import { variableSpans } from "../../lpmCommands";
import { MessageMarkdown } from "../MessageMarkdown";
import { MonacoEditor } from "../MonacoEditor";
import { SegmentedControl } from "../ui/SegmentedControl";

interface SkillPromptEditorProps {
  value: string;
  // Names the editor's model, so each skill keeps its own undo history.
  modelKey: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}

type View = "edit" | "preview";

const VIEWS = [
  { value: "edit" as const, label: "Edit" },
  { value: "preview" as const, label: "Preview" },
];

const PLACEHOLDER = "Review my uncommitted changes for bugs and list blocking issues first.";

// Marks each {{name}} as it's typed: cyan for a value a run asks for, green for
// one lpm fills in itself.
function markVariables(editor: monacoNs.editor.IStandaloneCodeEditor, monaco: typeof monacoNs) {
  const marks = editor.createDecorationsCollection();
  const paint = () => {
    const model = editor.getModel();
    if (!model) return;
    marks.set(
      variableSpans(model.getValue()).map(({ start, end, auto }) => {
        const from = model.getPositionAt(start);
        const to = model.getPositionAt(end);
        return {
          range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column),
          options: {
            inlineClassName: auto ? "lpm-skill-var-auto" : "lpm-skill-var-ask",
            hoverMessage: { value: auto ? "lpm fills this in" : "Asked for when the skill runs" },
          },
        };
      }),
    );
  };
  paint();
  const sub = editor.onDidChangeModelContent(paint);
  return () => {
    sub.dispose();
    marks.clear();
  };
}

// The prompt of a skill: Markdown in the code editor, its variables marked, or
// rendered the way it reads.
export function SkillPromptEditor({ value, modelKey, invalid, onChange, onSave }: SkillPromptEditorProps) {
  const [view, setView] = useState<View>("edit");
  const onReady = useCallback(markVariables, []);
  return (
    <div className="flex min-h-[180px] flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span id="lpm-command-body-label" className="text-[11.5px] font-medium text-[var(--text-muted)]">
          Prompt
        </span>
        <SegmentedControl
          value={view}
          options={VIEWS}
          onChange={setView}
          ariaLabel="Prompt view"
          className="ml-auto"
          variant="subtle"
        />
      </div>
      <div
        className={`relative min-h-[150px] flex-1 overflow-hidden rounded-md border bg-[var(--bg-secondary)] ${
          invalid ? "border-[var(--accent-amber)]" : "border-[var(--border)] focus-within:border-[var(--accent-cyan)]"
        }`}
      >
        {view === "edit" ? (
          <MonacoEditor
            value={value}
            onChange={onChange}
            onSave={onSave}
            language="markdown"
            modelUri={`inmemory://lpm/skills/${encodeURIComponent(modelKey)}.md`}
            perInstance
            wordWrap
            ariaLabel="Prompt"
            placeholder={PLACEHOLDER}
            onReady={onReady}
          />
        ) : (
          <div className="absolute inset-0 overflow-y-auto px-3 py-2" aria-labelledby="lpm-command-body-label">
            {value.trim() ? (
              <MessageMarkdown text={value} />
            ) : (
              <p className="text-[12px] text-[var(--text-muted)]">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
