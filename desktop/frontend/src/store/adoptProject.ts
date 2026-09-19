import { peerRawName } from "../peer/markers";

// What adopting a folder produced: the project's (routing) name, whether the
// folder was already a project rather than newly registered, and the services
// the host read off the folder's own files (none when it got the placeholder).
export interface AdoptedProject {
  name: string;
  existing: boolean;
  services: string[];
}

const LISTED_SERVICES = 6;

export function folderBaseName(dir: string): string {
  return dir.split("/").filter(Boolean).pop() || "new-project";
}

// A host running an older build answers with nothing; the folder's name is then
// the project's name, as it always was.
export function adoptedProject(result: unknown, fallbackName: string): AdoptedProject {
  const r = result as { name?: unknown; existing?: unknown; services?: unknown } | null;
  if (r && typeof r.name === "string" && r.name) {
    return { name: r.name, existing: r.existing === true, services: serviceNames(r.services) };
  }
  return { name: fallbackName, existing: false, services: [] };
}

export function serviceNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

// What the host set up from the folder's own files — nothing when the project
// got the placeholder service and still needs configuring.
export function detectionNotice(services: string[]): string | null {
  if (services.length === 0) return null;
  const noun = services.length === 1 ? "service" : "services";
  const listed = services.slice(0, LISTED_SERVICES).join(", ");
  const more = services.length - LISTED_SERVICES;
  const rest = more > 0 ? ` and ${more} more` : "";
  return `Found ${services.length} ${noun}: ${listed}${rest}`;
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
