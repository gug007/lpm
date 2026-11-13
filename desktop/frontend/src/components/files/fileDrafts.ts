// What each Files tab has open and its unsaved drafts, held outside the
// component: splitting a pane or moving the tab remounts it, and a closed tab
// can still be brought back while its undo toast is up.
export interface DirtyBuffer {
  baseline: string;
  draft: string;
}

export interface HeldFiles {
  path: string | null;
  buffers: ReadonlyMap<string, DirtyBuffer>;
}

const held = new Map<string, HeldFiles>();

export function heldFiles(tabId: string): HeldFiles | undefined {
  return held.get(tabId);
}

export function holdFiles(tabId: string, files: HeldFiles): void {
  if (files.path === null && files.buffers.size === 0) held.delete(tabId);
  else held.set(tabId, files);
}

export function forgetFiles(tabId: string): void {
  held.delete(tabId);
}

export function hasUnsavedFiles(tabId: string): boolean {
  return (held.get(tabId)?.buffers.size ?? 0) > 0;
}
