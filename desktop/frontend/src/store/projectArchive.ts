import { create } from "zustand";
import {
  ArchiveProject,
  FocusMainWindow,
  ListProjectTerminals,
  StopTerminal,
  UnarchiveProject,
} from "../../bridge/commands";
import { toast } from "../notifications/toast";
import { IS_MIRROR_WINDOW } from "../mirror";
import { isPeerName } from "../peer/markers";
import type { ConnectedPeer } from "../peer/route";
import {
  archiveLocation,
  archivePreview,
  listArchived,
  type ArchivedProject,
  type ArchivePreviewInfo,
} from "../projectArchive";
import { DEFAULT_SIDEBAR_NAV } from "../sidebarNav";
import { useAppStore } from "./app";
import { useSettingsStore } from "./settings";

// The project the archive confirmation is about, with what archiving it does.
export interface ArchiveAsk {
  name: string;
  label: string;
  preview: ArchivePreviewInfo;
  terminals: number;
}

export interface ArchiveTarget {
  name: string;
  label: string;
}

interface ProjectArchiveState {
  // Each machine's archived projects: "" for this one, else a paired slug.
  byMachine: Record<string, ArchivedProject[]>;
  peers: ConnectedPeer[];
  asking: ArchiveAsk | null;
  load: () => Promise<void>;
  ask: (target: ArchiveTarget) => Promise<void>;
  dismiss: () => void;
  confirm: () => Promise<void>;
  unarchive: (targets: ArchiveTarget[]) => Promise<void>;
}

export function archiveWhere(): string {
  return archiveLocation(useSettingsStore.getState().sidebarNavInSidebar ?? DEFAULT_SIDEBAR_NAV);
}

async function terminalIds(names: string[]): Promise<string[]> {
  const lists = await Promise.all(names.map((n) => ListProjectTerminals(n).catch(() => [])));
  return lists
    .flatMap((list: unknown) => (Array.isArray(list) ? list : []))
    .map((t) => (t as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

// The project and its copies, as this window lists them.
function family(name: string): string[] {
  const copies = useAppStore.getState().projects.filter((p) => p.parentName === name);
  return [name, ...copies.map((p) => p.name)];
}

let loadSeq = 0;

export const useProjectArchiveStore = create<ProjectArchiveState>((set, get) => ({
  byMachine: {},
  peers: [],
  asking: null,

  load: async () => {
    const seq = ++loadSeq;
    const machines = ["", ...get().peers.map((p) => p.slug)];
    // A paired machine whose lpm predates archiving can't list any: it keeps
    // what it had, which is nothing.
    const lists = await Promise.all(machines.map((m) => listArchived(m).catch(() => null)));
    if (seq !== loadSeq) return;
    set((s) => {
      const next: Record<string, ArchivedProject[]> = {};
      machines.forEach((m, i) => {
        const list = lists[i] ?? s.byMachine[m];
        if (list) next[m] = list;
      });
      return { byMachine: next };
    });
  },

  ask: async ({ name, label }) => {
    try {
      const [preview, terminals] = await Promise.all([
        archivePreview(name),
        terminalIds(family(name)),
      ]);
      set({ asking: { name, label, preview, terminals: terminals.length } });
    } catch (err) {
      toast.error(`Couldn't archive ${label}`, { description: String(err) });
    }
  },

  dismiss: () => set({ asking: null }),

  confirm: async () => {
    const asking = get().asking;
    if (!asking) return;
    set({ asking: null });
    const { name, label } = asking;
    const app = useAppStore.getState();
    try {
      if (app.detached.has(name)) await app.attachProject(name);
      // This window closes a local project's terminals as it drops the project,
      // keeping their tabs for when it comes back. A paired machine's terminals
      // run on there whatever this window shows, so they're closed by hand.
      if (isPeerName(name)) {
        const ids = await terminalIds(family(name));
        await Promise.all(ids.map((id) => StopTerminal(id).catch(() => {})));
      }
      await ArchiveProject(name);
    } catch (err) {
      toast.error(`Couldn't archive ${label}`, { description: String(err) });
      return;
    }
    await Promise.all([useAppStore.getState().refreshProjects(), get().load()]);
    toast.success(`${label} archived`, {
      description: `Unarchive it anytime from ${archiveWhere()}.`,
      action: { label: "Undo", onClick: () => void get().unarchive([{ name, label }]) },
    });
  },

  unarchive: async (targets) => {
    const failed: string[] = [];
    for (const t of targets) {
      try {
        await UnarchiveProject(t.name);
      } catch (err) {
        failed.push(`${t.label}: ${err}`);
      }
    }
    await Promise.all([useAppStore.getState().refreshProjects(), get().load()]);
    if (failed.length > 0) {
      toast.error(`Couldn't unarchive ${failed.length === 1 ? "a project" : `${failed.length} projects`}`, {
        description: failed.join("\n"),
      });
      return;
    }
    const [only] = targets;
    if (targets.length === 1 && only) {
      toast.success(`${only.label} is back in the sidebar`, {
        action: { label: "Open", onClick: () => useAppStore.getState().selectProject(only.name) },
      });
    } else if (targets.length > 1) {
      toast.success(`${targets.length} projects are back in the sidebar`);
    }
  },
}));

export function useArchivedCount(): number {
  return useProjectArchiveStore((s) =>
    Object.values(s.byMachine).reduce((n, list) => n + list.length, 0),
  );
}

// A detached window has no main area of its own, so the main window shows it.
export function openArchiveView(): void {
  if (IS_MIRROR_WINDOW) void FocusMainWindow(undefined, "archive");
  else useAppStore.getState().setView("archive");
}

export function askArchiveProject(target: ArchiveTarget): void {
  void useProjectArchiveStore.getState().ask(target);
}
