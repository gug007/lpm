import { useEffect, useId, useRef, useState } from "react";
import type * as monacoNs from "monaco-editor";
import { setupMonaco } from "../../monaco-setup";
import {
  MONACO_FONT_FAMILY,
  currentMonacoTheme,
  defineMonacoThemes,
  observeMonacoTheme,
} from "../../monaco-theme";
import { getSettings } from "../../store/settings";
import { makeDiffModels, type DiffModels } from "../review/reviewSource";

const DEFAULT_FONT_SIZE = 13;

interface FilesDiffEditorProps {
  path: string;
  original: string;
  value: string;
  onChange: (text: string) => void;
  onSave: () => void;
  readOnly: boolean;
}

// The open file against HEAD, the way the git view opens it. The right side
// is the same buffer the plain editor edits, so saving and conflicts stay one
// path.
export function FilesDiffEditor({
  path,
  original,
  value,
  onChange,
  onSave,
  readOnly,
}: FilesDiffEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monacoNs.editor.IStandaloneDiffEditor | null>(null);
  const modelsRef = useRef<DiffModels | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const lastEmittedRef = useRef(value);
  const suppressRef = useRef(false);
  const [ready, setReady] = useState(false);
  const authority = `files-${useId().replace(/\W/g, "")}`;

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const monaco = setupMonaco();
    defineMonacoThemes(monaco);
    const models = makeDiffModels(monaco, authority, "working", path, original, value);
    modelsRef.current = models;
    lastEmittedRef.current = value;

    const editor = monaco.editor.createDiffEditor(host, {
      theme: currentMonacoTheme(),
      automaticLayout: true,
      originalEditable: false,
      readOnly,
      renderSideBySide: true,
      ignoreTrimWhitespace: false,
      hideUnchangedRegions: { enabled: true },
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false },
      fontSize: getSettings().editorFontSize || DEFAULT_FONT_SIZE,
      fontFamily: MONACO_FONT_FAMILY,
      lineNumbers: "on",
      renderOverviewRuler: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      fixedOverflowWidgets: true,
    });
    editor.setModel(models);
    editorRef.current = editor;

    const modified = editor.getModifiedEditor();
    const sub = models.modified.onDidChangeContent(() => {
      if (suppressRef.current) return;
      const text = models.modified.getValue();
      lastEmittedRef.current = text;
      onChangeRef.current(text);
    });
    modified.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current();
    });

    // The macOS Edit menu eats ⌘Z/⌘⇧Z before keydown; they arrive as native
    // history edits, which would bypass Monaco's undo stack.
    const beforeInput = (e: Event) => {
      const inputType = (e as InputEvent).inputType;
      if (inputType !== "historyUndo" && inputType !== "historyRedo") return;
      e.preventDefault();
      e.stopPropagation();
      modified.trigger("menu", inputType === "historyUndo" ? "undo" : "redo", null);
    };
    host.addEventListener("beforeinput", beforeInput, true);

    const disposeTheme = observeMonacoTheme(monaco);
    setReady(true);

    return () => {
      setReady(false);
      disposeTheme();
      host.removeEventListener("beforeinput", beforeInput, true);
      sub.dispose();
      try {
        editor.setModel(null);
        editor.dispose();
      } catch {
        // Monaco can throw mid-teardown of its diff observables.
      }
      models.original.dispose();
      models.modified.dispose();
      editorRef.current = null;
      modelsRef.current = null;
    };
    // The models live as long as the file does; the props are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, authority]);

  useEffect(() => {
    if (!ready || value === lastEmittedRef.current) return;
    const model = modelsRef.current?.modified;
    if (!model) return;
    lastEmittedRef.current = value;
    if (model.getValue() === value) return;
    suppressRef.current = true;
    model.setValue(value);
    suppressRef.current = false;
  }, [value, ready]);

  useEffect(() => {
    if (!ready) return;
    const model = modelsRef.current?.original;
    if (model && model.getValue() !== original) model.setValue(original);
  }, [original, ready]);

  useEffect(() => {
    if (!ready) return;
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly, ready]);

  return <div ref={hostRef} data-text-scope="" className="h-full w-full" />;
}
