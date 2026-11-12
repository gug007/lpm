import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "../notifications/toast";
import { FileExists } from "../../bridge/commands";
import { registerFileDropHandler } from "../fileDrop";
import { watchFileDrag } from "../fileDragWatch";
import { composerDragActive } from "./useComposerDragMove";
import { useAppStore } from "../store/app";
import type { AdoptedProject } from "../store/adoptProject";
import { displayNameForProjectName } from "../components/ProjectNameDisplay";
import { FOLDER_DROP_ATTR, NOT_A_FOLDER, addedToast } from "../sidebarFolderDrop";
import type { ProjectGroup } from "../types";

export interface SidebarDropHover {
  list: DOMRect;
  folder: { name: string; rect: DOMRect } | null;
}

interface SidebarFolderDropOptions {
  groups: ProjectGroup[];
  onMoveProjectsToGroup: (names: string[], groupId: string | null) => void | Promise<void>;
  onOpen: (name: string) => void;
}

interface DropTarget {
  folder: HTMLElement | null;
  folderId: string | null;
}

// Only what is on top at the point counts, so a menu or dialog over the list
// takes its own drops.
function dropTargetAt(list: HTMLElement | null, x: number, y: number): DropTarget | null {
  const top = document.elementFromPoint(x, y);
  if (!list || !top || !list.contains(top)) return null;
  const folder = top.closest<HTMLElement>(`[${FOLDER_DROP_ATTR}]`);
  return { folder, folderId: folder?.getAttribute(FOLDER_DROP_ATTR) ?? null };
}

// Folders dragged in from the file manager become projects the way the +
// picker's Local folder does, filed into the folder header they land on.
export function useSidebarFolderDrop(
  listRef: RefObject<HTMLElement | null>,
  options: SidebarFolderDropOptions,
): SidebarDropHover | null {
  const [hover, setHover] = useState<SidebarDropHover | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let lastKey: string | null = null;
    const folderName = (id: string | null) =>
      id ? optionsRef.current.groups.find((g) => g.id === id)?.name : undefined;
    return watchFileDrag(
      (x, y) => {
        const target = dropTargetAt(listRef.current, x, y);
        const name = folderName(target?.folderId ?? null);
        const key = target ? (name ? `folder:${target.folderId}` : "list") : null;
        if (key === lastKey) return;
        lastKey = key;
        const list = listRef.current;
        setHover(
          target && list
            ? {
                list: list.getBoundingClientRect(),
                folder:
                  name && target.folder ? { name, rect: target.folder.getBoundingClientRect() } : null,
              }
            : null,
        );
      },
      () => {
        lastKey = null;
        setHover(null);
      },
    );
  }, [listRef]);

  useEffect(
    () =>
      registerFileDropHandler("sidebar-projects", (x, y, paths) => {
        if (paths.length === 0 || composerDragActive()) return false;
        const target = dropTargetAt(listRef.current, x, y);
        if (!target) return false;
        const { groups, onMoveProjectsToGroup, onOpen } = optionsRef.current;
        const folder = target.folderId ? groups.find((g) => g.id === target.folderId) : undefined;
        void addDroppedFolders(paths, onOpen, folder && { folder, move: onMoveProjectsToGroup });
        return true;
      }),
    [listRef],
  );

  return hover;
}

// Adds the dropped folders as projects, filed `into` a sidebar folder when
// given, and says what was added. Resolves with the projects it added.
export async function addDroppedFolders(
  paths: string[],
  onOpen: (name: string) => void,
  into?: { folder: ProjectGroup; move: SidebarFolderDropOptions["onMoveProjectsToGroup"] },
): Promise<AdoptedProject[]> {
  const isFile = await Promise.all(paths.map((p) => FileExists(p).catch(() => false)));
  const dirs = paths.filter((_, i) => !isFile[i]);
  if (dirs.length < paths.length) toast.error(NOT_A_FOLDER);
  const added: AdoptedProject[] = [];
  for (const dir of dirs) {
    const adopted = await useAppStore.getState().addLocalFolder(dir);
    if (adopted) added.push(adopted);
  }
  if (added.length === 0) return added;
  if (into) await into.move(added.map((a) => a.name), into.folder.id);
  const fresh = added.filter((a) => !a.existing);
  const projects = useAppStore.getState().projects;
  const text = addedToast(
    fresh.map((a) => displayNameForProjectName(a.name, projects)),
    into?.folder.name,
  );
  if (!text) return added;
  toast.success(
    text,
    fresh.length === 1
      ? { action: { label: "Open", onClick: () => onOpen(fresh[0].name) } }
      : undefined,
  );
  return added;
}
