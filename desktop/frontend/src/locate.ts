import { ListFolder, LocatePath } from "../bridge/commands";

// Where a path someone typed or a terminal printed leads, on the computer that
// holds the project.
export interface LocatedPath {
  kind: "file" | "dir" | "missing";
  // Absolute there.
  path: string;
  // Its place in the project ("" is the project's own folder); null outside it.
  rel: string | null;
}

export function locatePath(root: string, path: string): Promise<LocatedPath> {
  return LocatePath(root, path) as Promise<LocatedPath>;
}

// What the folder at `path` holds, unsorted, in the project or not.
export async function listFolder(root: string, path: string): Promise<{ name: string; isDir: boolean }[]> {
  const entries = await ListFolder(root, path);
  return Array.isArray(entries) ? entries : [];
}
