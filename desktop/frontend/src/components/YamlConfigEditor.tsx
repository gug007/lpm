import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type * as monacoNs from "monaco-editor";
import { BrowserOpenURL } from "../../bridge/runtime";
import { useYamlEditor } from "../hooks/useYamlEditor";
import { validateYaml } from "../yamlValidation";
import { configProblems } from "../configProblems";
import { BookOpen, type LucideIcon } from "lucide-react";
import { PageHeader } from "./ui/PageHeader";
import { BTN_SECONDARY } from "./ui/buttons";
import { MonacoEditor } from "./MonacoEditor";
import { EditorSaveBar } from "./EditorSaveBar";
import { formatYamlInEditor } from "../monacoYamlFormat";

// The editor grows with its text, keeping a line or two to type into, and
// shrinks to the window when the text is longer than that.
const MIN_EDITOR_HEIGHT = 220;
const ROOM_BELOW_TEXT = 44;

interface YamlConfigEditorProps {
  title: string;
  description: ReactNode;
  modelUri: string;
  load: () => Promise<string>;
  save: (content: string) => Promise<void>;
  // Keeps unsaved edits for this file while the editor is closed.
  draftKey: string;
  onBack?: () => void;
  backTitle?: string;
  icon?: LucideIcon;
  docsUrl?: string;
  // Shown while the file is empty.
  placeholder?: string;
}

export function YamlConfigEditor({
  title,
  description,
  modelUri,
  load,
  save,
  draftKey,
  onBack,
  backTitle = "Settings",
  icon,
  docsUrl,
  placeholder,
}: YamlConfigEditorProps) {
  const {
    content,
    setContent,
    dirty,
    saving,
    error,
    validationError,
    handleSave,
    discard,
  } = useYamlEditor(load, save, validateYaml, draftKey);
  const activeError = validationError ?? error;
  const problems = useMemo(() => configProblems(activeError), [activeError]);
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const editorHeight = Math.max(MIN_EDITOR_HEIGHT, contentHeight + ROOM_BELOW_TEXT);

  const onEditorReady = useCallback((editor: monacoNs.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    // Past the window's height the flex column clamps the editor anyway, so a
    // longer file needn't re-render the page on every line it grows by.
    const track = (height: number) => setContentHeight(Math.min(height, window.innerHeight));
    track(editor.getContentHeight());
    const sub = editor.onDidContentSizeChange((e) => track(e.contentHeight));
    return () => {
      sub.dispose();
      editorRef.current = null;
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={icon}
        title={title}
        description={description}
        back={onBack ? { label: backTitle, onClick: onBack } : undefined}
        actions={
          docsUrl && (
            <button
              type="button"
              onClick={() => BrowserOpenURL(docsUrl)}
              className={`${BTN_SECONDARY} flex items-center gap-1.5`}
              title="Open configuration reference"
            >
              <BookOpen size={13} strokeWidth={2} />
              Docs
            </button>
          )
        }
      />

      <div
        className="relative mt-4 min-h-0 shrink overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-sm focus-within:border-[var(--text-muted)]/60"
        style={{ height: editorHeight }}
      >
        <MonacoEditor
          value={content}
          onChange={setContent}
          language="yaml"
          modelUri={modelUri}
          onSave={handleSave}
          problems={problems}
          formatHint={false}
          placeholder={placeholder}
          onReady={onEditorReady}
        />
      </div>
      <EditorSaveBar
        dirty={dirty}
        saving={saving}
        error={activeError}
        invalid={Boolean(validationError)}
        onFormat={() => editorRef.current && formatYamlInEditor(editorRef.current)}
        onDiscard={discard}
        onSave={handleSave}
      />
    </div>
  );
}
