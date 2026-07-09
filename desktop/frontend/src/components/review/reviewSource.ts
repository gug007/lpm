import type * as monacoNs from "monaco-editor";
import {
  GitChangedFiles,
  GitChangedFilesRef,
  GitChangedFilesStaged,
  GitFileDiff,
  GitFileDiffs,
  GitFileDiffRef,
  GitFileDiffStaged,
} from "../../../bridge/commands";
import { main } from "../../../bridge/models";

export type ReviewMode = "working" | "base" | "staged";
type ChangedFile = main.ChangedFile;
export type DiffModels = {
  original: monacoNs.editor.ITextModel;
  modified: monacoNs.editor.ITextModel;
};
export type FileDiffResult = {
  original?: string;
  modified?: string;
  binary?: boolean;
  tooLarge?: boolean;
};

export type FileDiffRequest = { path: string; status?: string };

// One descriptor per review source owns its label, whether it is editable, and
// how to list its changed files / fetch one file's diff. Threading the mode as
// a primitive and re-deriving these in scattered branches is what this avoids.
export interface ReviewSource {
  label: string;
  editable: boolean;
  listChanged: (root: string, base: string) => Promise<ChangedFile[]>;
  fetchDiff: (
    root: string,
    path: string,
    base: string,
    status?: string,
  ) => Promise<FileDiffResult>;
  // Batch of `fetchDiff`: one backend call resolves every requested file's diff,
  // keyed by path. Used by the all-files pool to avoid one command per file.
  fetchDiffs: (
    root: string,
    files: FileDiffRequest[],
    base: string,
  ) => Promise<Record<string, FileDiffResult>>;
}

export const REVIEW_SOURCES: Record<ReviewMode, ReviewSource> = {
  working: {
    label: "Working tree",
    editable: true,
    listChanged: (root) => GitChangedFiles(root),
    fetchDiff: (root, path, _base, status) => GitFileDiff(root, path, status),
    fetchDiffs: (root, files, base) => GitFileDiffs(root, files, "working", base),
  },
  base: {
    label: "vs Base",
    editable: false,
    listChanged: (root, base) =>
      base ? GitChangedFilesRef(root, base) : Promise.resolve([]),
    fetchDiff: (root, path, base) => GitFileDiffRef(root, path, base),
    fetchDiffs: (root, files, base) => GitFileDiffs(root, files, "base", base),
  },
  staged: {
    label: "Staged",
    editable: false,
    listChanged: (root) => GitChangedFilesStaged(root),
    fetchDiff: (root, path) => GitFileDiffStaged(root, path),
    fetchDiffs: (root, files, base) => GitFileDiffs(root, files, "staged", base),
  },
};

export const REVIEW_MODES = Object.keys(REVIEW_SOURCES) as ReviewMode[];

// `authority` namespaces the model URI so the single-file pane and the all-files
// pool can hold independent models for the same (mode, path) without colliding.
export function makeDiffModels(
  monaco: typeof monacoNs,
  authority: string,
  mode: ReviewMode,
  path: string,
  original: string,
  modified: string,
): DiffModels {
  const make = (side: string, value: string) => {
    const uri = monaco.Uri.from({
      scheme: "lpm-diff",
      authority,
      path: `/${path}`,
      query: `mode=${mode}&side=${side}`,
    });
    monaco.editor.getModel(uri)?.dispose();
    return monaco.editor.createModel(value, undefined, uri);
  };
  return { original: make("original", original), modified: make("modified", modified) };
}

export const isPathEditable = (
  mode: ReviewMode,
  status: string | undefined,
  binary: boolean,
) => REVIEW_SOURCES[mode].editable && !binary && status !== "deleted";
