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

let modelSeq = 0;

// Each call gets URIs of its own, so two views of one path (two Files tabs, the
// commit review, a copy of the project) never share or dispose each other's
// models. The caller disposes what it made.
export function makeDiffModels(
  monaco: typeof monacoNs,
  mode: ReviewMode,
  path: string,
  original: string,
  modified: string,
): DiffModels {
  const authority = `m${++modelSeq}`;
  const make = (side: string, value: string) =>
    monaco.editor.createModel(
      value,
      undefined,
      monaco.Uri.from({
        scheme: "lpm-diff",
        authority,
        path: `/${path}`,
        query: `mode=${mode}&side=${side}`,
      }),
    );
  return { original: make("original", original), modified: make("modified", modified) };
}

export const isPathEditable = (
  mode: ReviewMode,
  status: string | undefined,
  binary: boolean,
) => REVIEW_SOURCES[mode].editable && !binary && status !== "deleted";
