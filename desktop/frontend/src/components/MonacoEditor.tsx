import { useEffect, useRef, useState } from "react";
import type * as monacoNs from "monaco-editor";
import { parseDocument } from "yaml";
import { setupMonaco } from "../monaco-setup";
import { getSettings, saveSettings } from "../settings";

const DEFAULT_EDITOR_FONT_SIZE = 13;
const MIN_EDITOR_FONT_SIZE = 8;
const MAX_EDITOR_FONT_SIZE = 24;

type Monaco = typeof monacoNs;

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  modelUri: string;
  onSave?: () => void;
  onToggleView?: () => void;
}

function currentTheme(): "lpm-dark" | "lpm-light" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "lpm-dark"
    : "lpm-light";
}

let themesDefined = false;
function defineThemes(monaco: Monaco) {
  if (themesDefined) return;
  themesDefined = true;
  const colors = {
    "editor.background": "#00000000",
    "editorGutter.background": "#00000000",
    "minimap.background": "#00000000",
    "scrollbarSlider.background": "#80808033",
    "scrollbarSlider.hoverBackground": "#80808055",
    "scrollbarSlider.activeBackground": "#80808077",
    focusBorder: "#00000000",
  };
  monaco.editor.defineTheme("lpm-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors,
  });
  monaco.editor.defineTheme("lpm-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors,
  });
}

export function MonacoEditor({
  value,
  onChange,
  language,
  modelUri,
  onSave,
  onToggleView,
}: MonacoEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onToggleViewRef = useRef(onToggleView);
  const suppressChangeRef = useRef(false);
  const [ready, setReady] = useState(false);
  const fontSizeRef = useRef(
    getSettings().editorFontSize || DEFAULT_EDITOR_FONT_SIZE,
  );

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onToggleViewRef.current = onToggleView;

  useEffect(() => {
    if (!hostRef.current) return;
    const monaco = setupMonaco();
    monacoRef.current = monaco;
    defineThemes(monaco);

    const modelLang = language || "plaintext";
    const uri = monaco.Uri.parse(modelUri);
    const existing = monaco.editor.getModel(uri);
    const model =
      existing ?? monaco.editor.createModel(value, modelLang, uri);
    if (existing && existing.getLanguageId() !== modelLang) {
      monaco.editor.setModelLanguage(existing, modelLang);
    }
    if (model.getValue() !== value) {
      suppressChangeRef.current = true;
      model.setValue(value);
      suppressChangeRef.current = false;
    }

    const editor = monaco.editor.create(hostRef.current, {
      model,
      theme: currentTheme(),
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: fontSizeRef.current,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
    });
    editorRef.current = editor;

    const sub = model.onDidChangeContent(() => {
      if (suppressChangeRef.current) return;
      onChangeRef.current(model.getValue());
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
      onToggleViewRef.current?.();
    });

    const applyFontSize = (size: number) => {
      const clamped = Math.max(
        MIN_EDITOR_FONT_SIZE,
        Math.min(MAX_EDITOR_FONT_SIZE, size),
      );
      if (clamped === fontSizeRef.current) return;
      fontSizeRef.current = clamped;
      editor.updateOptions({ fontSize: clamped });
      saveSettings({ editorFontSize: clamped }).catch(() => {});
    };

    const zoomIn = () => applyFontSize(fontSizeRef.current + 1);
    const zoomOut = () => applyFontSize(fontSizeRef.current - 1);
    const zoomReset = () => applyFontSize(DEFAULT_EDITOR_FONT_SIZE);

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

    if (modelLang === "yaml") {
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

    const themeObserver = new MutationObserver(() => {
      monaco.editor.setTheme(currentTheme());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const host = hostRef.current;
    return () => {
      themeObserver.disconnect();
      host?.removeEventListener("wheel", wheelHandler);
      sub.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUri]);

  useEffect(() => {
    if (!ready) return;
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    if (model.getValue() === value) return;
    suppressChangeRef.current = true;
    model.setValue(value);
    suppressChangeRef.current = false;
  }, [value, ready]);

  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const showFormatHint = language === "yaml";

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      {showFormatHint && (
        <div
          className="pointer-events-none absolute top-3 right-4 select-none font-mono text-[10px] font-medium uppercase tracking-wider text-neutral-500/70 dark:text-neutral-400/60"
          aria-hidden
        >
          <kbd>{isMac ? "⇧" : "Shift"}</kbd>
          <span className="mx-0.5">+</span>
          <kbd>{isMac ? "⌥" : "Alt"}</kbd>
          <span className="mx-0.5">+</span>
          <kbd>F</kbd>
          <span className="ml-2 normal-case tracking-normal">format</span>
        </div>
      )}
    </div>
  );
}
