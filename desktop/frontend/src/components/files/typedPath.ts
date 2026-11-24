// What the filter box takes as a path rather than part of a name: one that
// starts at a drive, the home folder or the folder above, or at the root or a
// leading dot with something after it.
const POSIX_PATH = /^(?:\/.|\.\/.|~\/|\.\.\/)/;
const WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\.|~\\|\.\.\\|\.\\.)/;

// Never listed, so a folder in one has no row to show (file_browser.rs).
const HIDDEN_DIRS = new Set([".git", ".svn", ".hg"]);

// `windows`: the project is on Windows, whose own spellings count too.
export function typedPath(query: string, windows: boolean): string | null {
  const path = query.trim();
  return POSIX_PATH.test(path) || (windows && WINDOWS_PATH.test(path)) ? path : null;
}

// Whether the tree has a row for a project folder.
export function inTree(rel: string): boolean {
  return !rel.split("/").some((name) => HIDDEN_DIRS.has(name));
}
