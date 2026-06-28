import {
  GitChangedFiles,
  GitChangedFilesRef,
  GitChangedFilesStaged,
  GitDiff,
  GitDiffBranch,
  GitDiffStaged,
  GitFileDiff,
  GitFileDiffRef,
  GitFileDiffStaged,
} from "../../../bridge/commands";
import { main } from "../../../bridge/models";

export type ReviewMode = "working" | "base" | "staged";
type ChangedFile = main.ChangedFile;
export type FileDiffResult = {
  original?: string;
  modified?: string;
  binary?: boolean;
};

// One descriptor per review source owns its label, whether it is editable, and
// how to list its changed files / fetch one file's diff. Threading the mode as
// a primitive and re-deriving these in scattered branches is what this avoids.
export interface ReviewSource {
  label: string;
  editable: boolean;
  listChanged: (root: string, base: string) => Promise<ChangedFile[]>;
  fetchDiff: (root: string, path: string, base: string) => Promise<FileDiffResult>;
  // One unified diff covering every changed file in this source, for the
  // stacked "All files" overview.
  fetchAllDiff: (
    root: string,
    files: ChangedFile[],
    base: string,
  ) => Promise<string>;
}

export const REVIEW_SOURCES: Record<ReviewMode, ReviewSource> = {
  working: {
    label: "Working tree",
    editable: true,
    listChanged: (root) => GitChangedFiles(root),
    fetchDiff: (root, path) => GitFileDiff(root, path),
    fetchAllDiff: (root, files) =>
      files.length ? GitDiff(root, files.map((f) => f.path)) : Promise.resolve(""),
  },
  base: {
    label: "vs Base",
    editable: false,
    listChanged: (root, base) =>
      base ? GitChangedFilesRef(root, base) : Promise.resolve([]),
    fetchDiff: (root, path, base) => GitFileDiffRef(root, path, base),
    fetchAllDiff: (root, _files, base) =>
      base ? GitDiffBranch(root, base) : Promise.resolve(""),
  },
  staged: {
    label: "Staged",
    editable: false,
    listChanged: (root) => GitChangedFilesStaged(root),
    fetchDiff: (root, path) => GitFileDiffStaged(root, path),
    fetchAllDiff: (root) => GitDiffStaged(root),
  },
};

export const REVIEW_MODES = Object.keys(REVIEW_SOURCES) as ReviewMode[];
