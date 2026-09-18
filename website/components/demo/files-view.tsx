"use client";

import { useCallback, useMemo, useState } from "react";
import { projectTree } from "./files-data";
import { isBinary } from "./files-data/generate";
import { indexEntry, rankFiles } from "./files-filter";
import { FilesEditor } from "./files-editor";
import { FilesHeader } from "./files-header";
import {
  ancestorsOf,
  basename,
  buildListings,
  buildMatchTree,
  flattenTree,
  type Item,
  type TreeRow,
} from "./files-model";
import { FilesTree } from "./files-tree";
import { decorate, type GitStatus } from "./git-decorations";
import type { DemoGit, DemoProject } from "./projects";
import { useFileView } from "./use-file-view";

const TREE_WIDTH = 248;
const FONT_SIZE = 12;
const NO_DECORATIONS: ReadonlyMap<string, GitStatus> = new Map();

// The Files tab: the project tree on the right, one file in a read-only editor
// on the left. Mirrors the app's FilesPane, minus the parts that need a real
// filesystem — saving, renaming and opening in another editor.
export function FilesView({ project, git }: { project: DemoProject; git?: DemoGit }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(["src"]));
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [changesOnly, setChangesOnly] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const [showDiff, setShowDiff] = useState(true);

  // Committing or discarding clears the working tree, so the tab stops marking
  // files the way the Review tab stops listing them.
  const changed = useMemo(
    () => ((git?.uncommitted ?? 0) > 0 ? project.changedFiles ?? [] : []),
    [git, project.changedFiles],
  );
  const tree = useMemo(
    () => projectTree(project.name, project.changedFiles ?? []),
    [project.name, project.changedFiles],
  );
  const listings = useMemo(() => buildListings(tree.paths), [tree.paths]);
  const decorations = useMemo(
    () => (changed.length > 0 ? decorate(changed) : NO_DECORATIONS),
    [changed],
  );

  const filtering = query.trim() !== "";
  const changeItems = useMemo<Item[]>(
    () => changed.map((file) => ({ path: file.path, isDir: false })),
    [changed],
  );
  const index = useMemo(
    () =>
      (changesOnly ? changeItems.map((it) => it.path) : tree.paths).map((path) =>
        indexEntry(path, false),
      ),
    [changesOnly, changeItems, tree.paths],
  );
  const results = useMemo(
    () => (filtering ? rankFiles(index, query) : null),
    [filtering, index, query],
  );
  const rows = useMemo(
    () =>
      changesOnly ? buildMatchTree(changeItems, collapsed) : flattenTree(listings, expanded),
    [changesOnly, changeItems, collapsed, listings, expanded],
  );

  const openFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      const dirs = ancestorsOf(path);
      setExpanded((prev) => {
        if (dirs.every((dir) => prev.has(dir))) return prev;
        const next = new Set(prev);
        for (const dir of dirs) next.add(dir);
        return next;
      });
      setCollapsed((prev) => {
        if (!dirs.some((dir) => prev.has(dir))) return prev;
        const next = new Set(prev);
        for (const dir of dirs) next.delete(dir);
        return next;
      });
    },
    [],
  );

  const toggleDir = useCallback(
    (path: string) => {
      const set = changesOnly ? setCollapsed : setExpanded;
      set((prev) => {
        const next = new Set(prev);
        // In the changes view every folder starts open, so the set it toggles
        // is the closed ones.
        if (!next.delete(path)) next.add(path);
        return next;
      });
    },
    [changesOnly],
  );

  // A breadcrumb or a filter hit names a folder: open the tree on it.
  const revealDir = useCallback(
    (dir: string) => {
      setQuery("");
      setTreeOpen(true);
      if (!dir) return;
      const dirs = [...ancestorsOf(dir), dir];
      if (changesOnly) setCollapsed((prev) => new Set([...prev].filter((p) => !dirs.includes(p))));
      else setExpanded((prev) => new Set([...prev, ...dirs]));
    },
    [changesOnly],
  );

  // One rule for every list: a file opens; a folder is revealed while filtering
  // and toggled otherwise.
  const activate = useCallback(
    (row: TreeRow) => {
      if (!row.isDir) {
        openFile(row.path);
        return;
      }
      if (filtering) revealDir(row.path);
      else toggleDir(row.path);
    },
    [filtering, openFile, revealDir, toggleDir],
  );

  const showChangesOnly = useCallback((on: boolean) => {
    setChangesOnly(on);
    setQuery("");
  }, []);

  const status = selectedPath ? decorations.get(selectedPath) : undefined;
  const changedFile = changed.find((file) => file.path === selectedPath) ?? null;
  const binary = selectedPath !== null && isBinary(selectedPath);
  const content = selectedPath && !binary ? tree.read(selectedPath) : "";
  const fileView = useFileView(selectedPath, changedFile !== null, showDiff, setShowDiff);
  // A README's relative link opens the file it names, if the tree has it.
  const openLinked = useCallback(
    (path: string) => {
      if (tree.paths.includes(path)) openFile(path);
    },
    [tree.paths, openFile],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1a1a1a]">
      <FilesHeader
        rootName={basename(project.root) || project.name}
        path={selectedPath}
        status={status}
        view={fileView.view}
        viewOptions={fileView.options}
        onView={fileView.select}
        zoom={fileView.previewing ? fileView.zoom : null}
        treeOpen={treeOpen}
        onRevealDir={revealDir}
        onToggleTree={() => setTreeOpen((open) => !open)}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <FilesEditor
            path={selectedPath}
            content={content}
            binary={binary}
            diff={changedFile && showDiff ? changedFile : null}
            markdown={fileView.previewing ? { zoom: fileView.zoom, onOpenFile: openLinked } : null}
            fontSize={FONT_SIZE}
          />
        </div>
        {treeOpen && (
          <div
            className="flex shrink-0 flex-col border-l border-[#2e2e2e]"
            style={{ width: TREE_WIDTH }}
          >
            <FilesTree
              rows={rows}
              changesOnly={changesOnly}
              changeCount={changed.length}
              onChangesOnlyChange={showChangesOnly}
              decorations={decorations}
              selectedPath={selectedPath}
              query={query}
              onQueryChange={setQuery}
              results={results}
              onActivate={activate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
