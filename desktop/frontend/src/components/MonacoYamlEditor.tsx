import { useEffect, useRef, useState } from "react";
import type * as monacoNs from "monaco-editor";
import { parseDocument } from "yaml";
import { setupMonaco } from "../monaco-setup";

type Monaco = typeof monacoNs;

interface MonacoYamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  modelUri: string;
  onSave?: () => void;
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

export function MonacoYamlEditor({
  value,
  onChange,
  modelUri,
  onSave,
}: MonacoYamlEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const suppressChangeRef = useRef(false);
  const [ready, setReady] = useState(false);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!hostRef.current) return;
    const monaco = setupMonaco();
    monacoRef.current = monaco;
    defineThemes(monaco);

    const uri = monaco.Uri.parse(modelUri);
    const model =
      monaco.editor.getModel(uri) ?? monaco.editor.createModel(value, "yaml", uri);
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
      fontSize: 13,
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

    setReady(true);

    const themeObserver = new MutationObserver(() => {
      monaco.editor.setTheme(currentTheme());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      themeObserver.disconnect();
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

  return <div ref={hostRef} className="h-full w-full" />;
}
