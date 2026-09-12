import { peerRawName } from "../peer/markers";

// What adopting a folder produced: the project's (routing) name, and whether the
// folder was already a project rather than newly registered.
export interface AdoptedProject {
  name: string;
  existing: boolean;
}

export function folderBaseName(dir: string): string {
  return dir.split("/").filter(Boolean).pop() || "new-project";
}

// A host running an older build answers with nothing; the folder's name is then
// the project's name, as it always was.
export function adoptedProject(result: unknown, fallbackName: string): AdoptedProject {
  const r = result as { name?: unknown; existing?: unknown } | null;
  if (r && typeof r.name === "string" && r.name) {
    return { name: r.name, existing: r.existing === true };
  }
  return { name: fallbackName, existing: false };
}

// What to tell the user when the project didn't land under the folder's own
// name — nothing when it did. `label` is what the sidebar calls an existing
// project, which is the name the user recognises; `where` names a paired Mac.
export function adoptionNotice(
  adopted: AdoptedProject,
  requested: string,
  label: string | undefined,
  where: string,
): string | null {
  const name = peerRawName(adopted.name);
  const on = where ? ` on ${where}` : "";
  if (adopted.existing) {
    return `That folder is already the project “${label || name}”${on}.`;
  }
  if (name !== requested) {
    return `Added as “${name}” — a project named “${requested}” already exists${on}.`;
  }
  return null;
}
