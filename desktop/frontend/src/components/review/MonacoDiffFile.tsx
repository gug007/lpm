import { useCallback, useEffect, useRef, useState } from "react";
import type * as monacoNs from "monaco-editor";
import { toast } from "sonner";
import { WriteFileIfUnchanged } from "../../../bridge/commands";
import { main } from "../../../bridge/models";
import { joinAbs } from "../../path";
import { setupMonaco } from "../../monaco-setup";
import {
  MONACO_FONT_FAMILY,
  currentMonacoTheme,
  defineMonacoThemes,
  observeMonacoTheme,
} from "../../monaco-theme";
import { useGitChanged } from "../../hooks/useGitChanged";
import { STATUS_DISPLAY, DEFAULT_STATUS } from "../ChangedFilesTree";
import { READ_HEAVY_DIFF_OPTIONS } from "./diffEditorOptions";
import { REVIEW_SOURCES, type ReviewMode } from "./reviewSource";
import { DiffConflictBanner } from "./DiffConflictBanner";
import { BinaryFilePlaceholder } from "./BinaryFilePlaceholder";

type Monaco = typeof monacoNs;
type ChangedFile = main.ChangedFile;
type DiffModels = {
  original: monacoNs.editor.ITextModel;
  modified: monacoNs.editor.ITextModel;
};

interface MonacoDiffFileProps {
  projectRoot: string;
  file: ChangedFile;
  mode: ReviewMode;
  baseBranch: string;
  fontSize: number;
  // False while the stack is hidden — pauses this file's git reconcile.
  active: boolean;
}

// One changed file rendered as an editable Monaco diff editor that auto-sizes to
// its content (so the parent column scrolls through every file) and collapses
// unchanged regions. Working-tree files are editable; a save goes through the
// compare-and-swap write so a concurrent terminal-agent write can't be clobbered,
// and the editor follows disk live (raising a conflict over unsaved edits).
export function MonacoDiffFile({
  projectRoot,
  file,
  mode,
  baseBranch,
  fontSize,
  active,
}: MonacoDiffFileProps) {
  const path = file.path;
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monacoNs.editor.IStandaloneDiffEditor | null>(null);
  const modelsRef = useRef<DiffModels | null>(null);
  const diskBaselineRef = useRef("");
  const originalRef = useRef("");
  const cleanVersionRef = useRef(0);
  const suppressRef = useRef(false);
  const savingRef = useRef(false);
  const activeRef = useRef(active);
  const saveRef = useRef<() => void>(() => {});
  activeRef.current = active;

  const [dirty, setDirty] = useState(false);
  const [binary, setBinary] = useState(false);
  const [editable, setEditable] = useState(false);
  const [conflict, setConflict] = useState<{ theirs: string } | null>(null);

  const cas = async (expected: string): Promise<void> => {
    const models = modelsRef.current;
    if (!models) return;
    const content = models.modified.getValue();
    savingRef.current = true;
    let res: { written?: boolean; currentContent?: string };
    try {
      res = await WriteFileIfUnchanged(joinAbs(projectRoot, path), expected, content);
    } catch (e) {
      savingRef.current = false;
      toast.error(e instanceof Error ? e.message : "Could not save file");
      return;
    }
    if (res?.written) {
      diskBaselineRef.current = content;
      cleanVersionRef.current = models.modified.getAlternativeVersionId();
      setDirty(false);
      setConflict(null);
      toast.success("Saved");
    } else {
      setConflict({ theirs: res?.currentContent ?? "" });
    }
    savingRef.current = false;
  };

  const save = () => {
    if (!editable || !dirty || savingRef.current) return;
    cas(diskBaselineRef.current);
  };
  saveRef.current = save;

  const resolveConflict = (kind: "overwrite" | "theirs" | "dismiss") => {
    const c = conflict;
    const models = modelsRef.current;
    if (!c || !models || kind === "dismiss") {
      setConflict(null);
      return;
    }
    if (kind === "theirs") {
      suppressRef.current = true;
      models.modified.setValue(c.theirs);
      suppressRef.current = false;
      diskBaselineRef.current = c.theirs;
      cleanVersionRef.current = models.modified.getAlternativeVersionId();
      setDirty(false);
      setConflict(null);
      return;
    }
    cas(c.theirs); // overwrite: their content is the new baseline so the CAS matches
  };

  // Follow disk for a clean buffer, raise a conflict for a dirty one, no-op when
  // unchanged — the same contract as the single-file pane's reconcile.
  const reconcile = useCallback(async () => {
    if (!activeRef.current || savingRef.current) return;
    const models = modelsRef.current;
    if (!models) return;
    let diff: { original?: string; modified?: string; binary?: boolean };
    try {
      diff = await REVIEW_SOURCES[mode].fetchDiff(projectRoot, path, baseBranch);
    } catch {
      return;
    }
    // models are nulled on dispose, so this also covers an unmount mid-fetch.
    if (!modelsRef.current || diff.binary) return;
    const disk = diff.modified ?? "";
    const original = diff.original ?? "";
    if (original !== originalRef.current) {
      originalRef.current = original;
      suppressRef.current = true;
      models.original.setValue(original);
      suppressRef.current = false;
    }
    if (disk === diskBaselineRef.current) return; // own save echo / unrelated churn
    const isDirty =
      models.modified.getAlternativeVersionId() !== cleanVersionRef.current;
    if (isDirty) {
      setConflict({ theirs: disk });
      return;
    }
    suppressRef.current = true;
    models.modified.setValue(disk);
    suppressRef.current = false;
    diskBaselineRef.current = disk;
    cleanVersionRef.current = models.modified.getAlternativeVersionId();
  }, [projectRoot, path, mode, baseBranch]);

  useGitChanged(projectRoot, reconcile);
  useEffect(() => {
    if (active) reconcile();
  }, [active, reconcile]);

  useEffect(() => {
    if (!hostRef.current) return;
    // Per-effect-run flag (NOT a shared ref): under StrictMode the effect runs
    // twice and a shared ref reset by the second run would let the first run's
    // in-flight async build a second editor into the same host (blank render).
    let cancelled = false;
    const monaco: Monaco = setupMonaco();
    defineMonacoThemes(monaco);
    const host = hostRef.current;

    let disposeTheme = () => {};
    const subs: monacoNs.IDisposable[] = [];
    let lastHeight = -1;

    (async () => {
      let diff: { original?: string; modified?: string; binary?: boolean };
      try {
        diff = await REVIEW_SOURCES[mode].fetchDiff(projectRoot, path, baseBranch);
      } catch {
        return;
      }
      if (cancelled) return;
      if (diff.binary) {
        setBinary(true);
        return;
      }

      const editor = monaco.editor.createDiffEditor(host, {
        ...READ_HEAVY_DIFF_OPTIONS,
        theme: currentMonacoTheme(),
        automaticLayout: true,
        readOnly: true,
        originalEditable: false,
        renderSideBySide: true,
        ignoreTrimWhitespace: false,
        // VS Code-style collapsed unchanged regions with expandable bands.
        hideUnchangedRegions: { enabled: true },
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        // The editor grows to its content height and the parent column scrolls,
        // so suppress the editor's own vertical scroll and let the wheel bubble.
        scrollbar: {
          vertical: "hidden",
          alwaysConsumeMouseWheel: false,
          horizontalScrollbarSize: 10,
        },
        renderOverviewRuler: false,
        overviewRulerLanes: 0,
        fontSize,
        fontFamily: MONACO_FONT_FAMILY,
        lineNumbers: "on",
        fixedOverflowWidgets: true,
      });
      editorRef.current = editor;
      disposeTheme = observeMonacoTheme(monaco);

      const original = diff.original ?? "";
      const modified = diff.modified ?? "";
      const canEdit = mode === "working" && file.status !== "deleted";
      const mk = (side: string, value: string) => {
        const uri = monaco.Uri.from({
          scheme: "lpm-diff",
          authority: "stack",
          path: `/${path}`,
          query: `mode=${mode}&side=${side}`,
        });
        monaco.editor.getModel(uri)?.dispose();
        return monaco.editor.createModel(value, undefined, uri);
      };
      const models = { original: mk("original", original), modified: mk("modified", modified) };
      modelsRef.current = models;
      diskBaselineRef.current = modified;
      originalRef.current = original;
      cleanVersionRef.current = models.modified.getAlternativeVersionId();
      editor.setModel({ original: models.original, modified: models.modified });
      editor.updateOptions({ readOnly: !canEdit });
      setEditable(canEdit);

      const orig = editor.getOriginalEditor();
      const mod = editor.getModifiedEditor();

      const updateHeight = () => {
        const h = Math.max(40, orig.getContentHeight(), mod.getContentHeight());
        if (h === lastHeight) return;
        lastHeight = h;
        host.style.height = `${h}px`;
        // Pass explicit dims so Monaco lays out to the host's real width rather
        // than re-measuring (which can be 0 mid-flex-layout -> blank paint).
        editor.layout({ width: host.clientWidth, height: h });
      };
      subs.push(orig.onDidContentSizeChange(updateHeight));
      subs.push(mod.onDidContentSizeChange(updateHeight));
      // Defer the first sizing a frame so the host has a real width.
      requestAnimationFrame(() => {
        if (cancelled) return;
        lastHeight = -1;
        updateHeight();
      });

      subs.push(
        mod.onDidChangeModelContent(() => {
          if (suppressRef.current) return;
          const m = modelsRef.current;
          if (!m) return;
          setDirty(m.modified.getAlternativeVersionId() !== cleanVersionRef.current);
        }),
      );
      mod.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
    })();

    return () => {
      cancelled = true;
      disposeTheme();
      subs.forEach((s) => s.dispose());
      editorRef.current?.dispose();
      modelsRef.current?.original.dispose();
      modelsRef.current?.modified.dispose();
      modelsRef.current = null;
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { label: statusLabel, color: statusClr } =
    STATUS_DISPLAY[file.status] ?? DEFAULT_STATUS;

  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[11px] font-medium text-[var(--text-primary)]">
        <span className={`w-3 shrink-0 text-center font-bold ${statusClr}`} title={file.status}>
          {statusLabel}
        </span>
        <span className="truncate">{path}</span>
        {dirty && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)]" />
        )}
        <span className="flex-1" />
        {editable && dirty && (
          <button
            onClick={save}
            className="shrink-0 rounded-md bg-[var(--text-primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
          >
            Save
          </button>
        )}
      </div>
      {conflict && (
        <DiffConflictBanner
          path={path}
          onOverwrite={() => resolveConflict("overwrite")}
          onUseTheirs={() => resolveConflict("theirs")}
          onDismiss={() => resolveConflict("dismiss")}
        />
      )}
      {binary ? (
        <div className="py-6">
          <BinaryFilePlaceholder path={path} />
        </div>
      ) : (
        <div ref={hostRef} className="w-full" style={{ height: 120 }} />
      )}
    </div>
  );
}
