import { useAppStore } from "../store/app";
import { useSettingsStore } from "../store/settings";
import type { ProjectInfo } from "../types";
import {
  layoutOwner,
  withDefaultLayout,
  withSavedLayout,
  withoutSavedLayout,
  type ProjectLayouts,
  type SavedLayout,
  type SavedLayoutNode,
  type SavedLayoutsConfig,
} from "../savedLayouts";

const NONE: ProjectLayouts = { layouts: [] };

function ownerIn(projects: readonly ProjectInfo[], projectName: string): string {
  const project = projects.find((p) => p.name === projectName);
  return project ? layoutOwner(project) : projectName;
}

const ownerOf = (projectName: string) => ownerIn(useAppStore.getState().projects, projectName);

// Writes start from the settings as they are now, not as last rendered: the
// file is the source of truth and two quick edits must not undo each other.
function edit(fn: (config: SavedLayoutsConfig | undefined) => SavedLayoutsConfig | undefined) {
  const savedLayouts = fn(useSettingsStore.getState().savedLayouts);
  void useSettingsStore.getState().update({ savedLayouts });
}

export function useProjectLayouts(projectName: string): ProjectLayouts {
  const owner = useAppStore((s) => ownerIn(s.projects, projectName));
  return useSettingsStore((s) => s.savedLayouts?.[owner] ?? NONE);
}

export function defaultLayoutFor(projectName: string): SavedLayout | undefined {
  const own = useSettingsStore.getState().savedLayouts?.[ownerOf(projectName)];
  return own?.layouts.find((l) => l.id === own.defaultId);
}

export function saveLayout(projectName: string, name: string, root: SavedLayoutNode) {
  const layout: SavedLayout = { id: `layout-${Date.now().toString(36)}`, name, root };
  edit((config) => withSavedLayout(config, ownerOf(projectName), layout));
}

export function replaceLayout(projectName: string, layout: SavedLayout) {
  edit((config) => withSavedLayout(config, ownerOf(projectName), layout));
}

export function deleteLayout(projectName: string, id: string) {
  edit((config) => withoutSavedLayout(config, ownerOf(projectName), id));
}

export function setDefaultLayout(projectName: string, id: string | undefined) {
  edit((config) => withDefaultLayout(config, ownerOf(projectName), id));
}
