import { useEffect, useId, useRef, useState } from "react";
import type * as monacoNs from "monaco-editor";
import { parseDocument } from "yaml";
import { setupMonaco } from "../monaco-setup";
import {
  DEFAULT_MONACO_FONT_SIZE,
  MONACO_FONT_FAMILY,
  clampMonacoFontSize,
  currentMonacoTheme,
  defineMonacoThemes,
  observeMonacoTheme,
} from "../monaco-theme";
import { getSettings, saveSettings, useSettingsStore } from "../store/settings";
import { altKeyLabel, shiftKeyLabel } from "../keys";

type Monaco = typeof monacoNs;

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  // Omitted, Monaco infers it from the model URI's extension.
  language?: string;
  modelUri: string;
  // Give this mount its own model even when another editor shows the same
  // URI: the editor adopts an existing model for its URI and disposes it on
  // unmount, so two instances on one file would tear each other down.
  perInstance?: boolean;
  onSave?: () => void;
  onToggleView?: () => void;
  readOnly?: boolean;
  // Opens scrolled to this line, cursor on it and the line marked, and takes
  // focus; read once, when the editor mounts.
  reveal?: { line: number; col: number };
}

export function MonacoEditor({
  value,
  onChange,
  language,
  modelUri,
  perInstance = false,
  onSave,
  onToggleView,
  readOnly = false,
  reveal,
}: MonacoEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onToggleViewRef = useRef(onToggleView);
  const revealRef = useRef(reveal);
  // The text the model holds as far as this component knows — typed by the
  // user or set from `value` — so the value effect can skip its own echo.
  const lastEmittedRef = useRef(value);
  const suppressChangeRef = useRef(false);
  const [ready, setReady] = useState(false);
  const instanceId = useId().replace(/\W/g, "");
  const fontSizeRef = useRef(
    getSettings().editorFontSize || DEFAULT_MONACO_FONT_SIZE,
  );
  const settingsFontSize = useSettingsStore((s) => s.editorFontSize);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onToggleViewRef.current = onToggleView;

  useEffect(() => {
    if (!hostRef.current) return;
    const monaco = setupMonaco();
    monacoRef.current = monaco;
    defineMonacoThemes(monaco);

    const baseUri = monaco.Uri.parse(modelUri);
    const uri = perInstance
      ? baseUri.with({ authority: [baseUri.authority, instanceId].filter(Boolean).join("-") })
      : baseUri;
    const existing = monaco.editor.getModel(uri);
    const model = existing ?? monaco.editor.createModel(value, language, uri);
    if (existing && language && existing.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(existing, language);
    }
    if (model.getValue() !== value) {
      suppressChangeRef.current = true;
      model.setValue(value);
      suppressChangeRef.current = false;
    }
    lastEmittedRef.current = value;

    const editor = monaco.editor.create(hostRef.current, {
      model,
      theme: currentMonacoTheme(),
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: fontSizeRef.current,
      fontFamily: MONACO_FONT_FAMILY,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      tabSize: 2,
      insertSpaces: true,
      renderLineHighlight: "none",
      stickyScroll: { enabled: false },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      padding: { top: 12, bottom: 12 },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      fixedOverflowWidgets: true,
      readOnly,
      domReadOnly: readOnly,
    });
    editorRef.current = editor;

    const at = revealRef.current;
    if (at) {
      if (at.line > 0) {
        const lineNumber = Math.min(at.line, model.getLineCount());
        editor.setPosition({ lineNumber, column: Math.max(1, at.col) });
        editor.revealLineInCenter(lineNumber);
        editor.createDecorationsCollection([
          {
            range: new monaco.Range(lineNumber, 1, lineNumber, 1),
            options: { isWholeLine: true, className: "lpm-reveal-line" },
          },
        ]);
      }
      editor.focus();
    }

    const sub = model.onDidChangeContent(() => {
      if (suppressChangeRef.current) return;
      const text = model.getValue();
      lastEmittedRef.current = text;
      onChangeRef.current(text);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.();
    });

    // Bound only when the host has a view to toggle; otherwise ⌘E stays a
    // project-level chord instead of dying in the editor.
    if (onToggleViewRef.current) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
        onToggleViewRef.current?.();
      });
    }

    const applyFontSize = (size: number) => {
      const clamped = clampMonacoFontSize(size);
      if (clamped === fontSizeRef.current) return;
      fontSizeRef.current = clamped;
      editor.updateOptions({ fontSize: clamped });
      saveSettings({ editorFontSize: clamped }).catch(() => {});
    };

    const zoomIn = () => applyFontSize(fontSizeRef.current + 1);
    const zoomOut = () => applyFontSize(fontSizeRef.current - 1);
    const zoomReset = () => applyFontSize(DEFAULT_MONACO_FONT_SIZE);

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, zoomIn);
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Equal,
      zoomIn,
    );
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadAdd,
      zoomIn,
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, zoomOut);
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadSubtract,
      zoomOut,
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, zoomReset);

    const wheelHandler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
    };
    hostRef.current?.addEventListener("wheel", wheelHandler, { passive: false });

    // The macOS Edit menu consumes ⌘Z/⌘⇧Z before keydown reaches the webview;
    // they arrive as native history edits on Monaco's hidden textarea, which
    // bypass (and would desync) Monaco's own undo stack. Cancel the native edit
    // and drive Monaco's undo/redo instead.
    const beforeInputHandler = (e: Event) => {
      const inputType = (e as InputEvent).inputType;
      if (inputType !== "historyUndo" && inputType !== "historyRedo") return;
      e.preventDefault();
      e.stopPropagation();
      editor.trigger("menu", inputType === "historyUndo" ? "undo" : "redo", null);
    };
    hostRef.current?.addEventListener("beforeinput", beforeInputHandler, true);

    const menuSelectAllHandler = (e: Event) => {
      if (!editor.hasTextFocus()) return;
      e.preventDefault();
      editor.trigger("menu", "editor.action.selectAll", null);
    };
    window.addEventListener("lpm-menu-select-all", menuSelectAllHandler);

    if (model.getLanguageId() === "yaml") {
      editor.addCommand(
        monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
        () => {
          const current = model.getValue();
          let formatted: string;
          try {
            const doc = parseDocument(current);
            if (doc.errors.length > 0) return;
            formatted = doc.toString({ indent: 2, lineWidth: 0 });
          } catch {
            return;
          }
          if (formatted === current) return;
          editor.executeEdits("format", [
            {
              range: model.getFullModelRange(),
              text: formatted,
              forceMoveMarkers: true,
            },
          ]);
          editor.pushUndoStop();
        },
      );
    }

    setReady(true);

    const disposeTheme = observeMonacoTheme(monaco);

    const host = hostRef.current;
    return () => {
      disposeTheme();
      host?.removeEventListener("wheel", wheelHandler);
      host?.removeEventListener("beforeinput", beforeInputHandler, true);
      window.removeEventListener("lpm-menu-select-all", menuSelectAllHandler);
      sub.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUri]);

  useEffect(() => {
    if (!ready || value === lastEmittedRef.current) return;
    const model = editorRef.current?.getModel();
    if (!model) return;
    lastEmittedRef.current = value;
    if (model.getValue() === value) return;
    suppressChangeRef.current = true;
    model.setValue(value);
    suppressChangeRef.current = false;
  }, [value, ready]);

  useEffect(() => {
    if (!ready) return;
    editorRef.current?.updateOptions({ readOnly, domReadOnly: readOnly });
  }, [readOnly, ready]);

  // Another editor, or a zoom control, changed the shared font size.
  useEffect(() => {
    if (!ready) return;
    const size = clampMonacoFontSize(settingsFontSize || DEFAULT_MONACO_FONT_SIZE);
    if (size === fontSizeRef.current) return;
    fontSizeRef.current = size;
    editorRef.current?.updateOptions({ fontSize: size });
  }, [settingsFontSize, ready]);

  const showFormatHint = language === "yaml";

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} data-text-scope="" className="h-full w-full" />
      {showFormatHint && (
        <div
          className="pointer-events-none absolute top-3 right-4 select-none font-mono text-[10px] font-medium uppercase tracking-wider text-neutral-500/70 dark:text-neutral-400/60"
          aria-hidden
        >
          <kbd>{shiftKeyLabel()}</kbd>
          <span className="mx-0.5">+</span>
          <kbd>{altKeyLabel()}</kbd>
          <span className="mx-0.5">+</span>
          <kbd>F</kbd>
          <span className="ml-2 normal-case tracking-normal">format</span>
        </div>
      )}
    </div>
  );
}
