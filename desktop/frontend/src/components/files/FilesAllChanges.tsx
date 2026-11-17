import { memo, useMemo } from "react";
import { DEFAULT_MONACO_FONT_SIZE } from "../../monaco-theme";
import { useSettingsStore } from "../../store/settings";
import { MonacoDiffPool } from "../review/MonacoDiffPool";
import { buildMatchTree, type Item } from "./treeModel";
import type { ChangedFile } from "./useChangedFiles";

interface FilesAllChangesProps {
  projectRoot: string;
  files: readonly ChangedFile[];
  // Reader zoom as a factor of the configured editor font size.
  zoom: number;
  sideBySide: boolean;
  wordWrap: boolean;
  active: boolean;
  // The file at the top of the viewport as the stack is scrolled, so the rail
  // can follow along.
  onActiveFileChange: (path: string) => void;
  // What the commit review picked: the files left out dim.
  selected?: Set<string>;
  onDirtyPathsChange?: (paths: Set<string>) => void;
  onSplitFitsChange?: (fits: boolean) => void;
}

// Every uncommitted file as one scrolling stack of diffs. Memoized so the pane
// re-rendering for its rail (the scroll spy moves the selection) leaves the
// stack alone.
export const FilesAllChanges = memo(function FilesAllChanges({
  projectRoot,
  files,
  zoom,
  sideBySide,
  wordWrap,
  active,
  onActiveFileChange,
  selected,
  onDirtyPathsChange,
  onSplitFitsChange,
}: FilesAllChangesProps) {
  const baseFontSize = useSettingsStore((s) => s.editorFontSize) || DEFAULT_MONACO_FONT_SIZE;
  // Tree order — folders first, alphabetical — so the stack reads in the order
  // the rail lists it.
  const ordered = useMemo(() => {
    const status = new Map(files.map((f) => [f.path, f.status]));
    const items: Item[] = files.map((f) => ({ path: f.path, isDir: false }));
    return buildMatchTree(items)
      .filter((row) => !row.isDir)
      .map((row) => ({ path: row.path, status: status.get(row.path) ?? "modified" }));
  }, [files]);

  return (
    <MonacoDiffPool
      projectRoot={projectRoot}
      files={ordered}
      mode="working"
      baseBranch=""
      fontSize={baseFontSize * zoom}
      sideBySide={sideBySide}
      wordWrap={wordWrap}
      active={active}
      selected={selected}
      onActiveFileChange={onActiveFileChange}
      onDirtyPathsChange={onDirtyPathsChange}
      onSplitFitsChange={onSplitFitsChange}
    />
  );
});
