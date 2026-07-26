import { isPeerName, parsePeerMarker, stripMarker } from "../peer/markers";
import type { PeerClient } from "../peer/usePeerState";
import type { ProjectInfo } from "../types";

// A Mac that holds the same project and can hand its working state over.
export interface BringSource {
  slug: string;
  alias: string;
  // Host-native absolute path of the project on that Mac.
  root: string;
}

// What the sidebar needs to offer "Bring Changes…" for a right-clicked row:
// the local project the work lands in, every Mac it can come from, and which
// of those to preselect.
export interface BringChangesEntry {
  project: ProjectInfo;
  sources: BringSource[];
  initialSlug: string;
}

// Connected Macs running a build that speaks the transfer, holding a project of
// this name whose root actually lives on that Mac (an SSH project's files
// don't, so its Git state isn't theirs to hand over).
export function bringChangesSources(
  projects: ProjectInfo[],
  peers: PeerClient[],
  rawName: string,
): BringSource[] {
  const sources: BringSource[] = [];
  for (const peer of peers) {
    if (!peer.connected || !peer.supportsGitBring) continue;
    const match = projects.find(
      (p) =>
        stripMarker(p.name) === rawName &&
        parsePeerMarker(p.name)?.slug === peer.slug,
    );
    if (!match || match.isRemote) continue;
    const marker = parsePeerMarker(match.root);
    if (marker?.kind !== "root" || marker.slug !== peer.slug) continue;
    sources.push({
      slug: peer.slug,
      alias: peer.alias || peer.host,
      root: marker.raw,
    });
  }
  return sources;
}

// Resolves either entry point — a local project row or the same project's row
// under a peer — to the same local target, preselecting the Mac that was
// right-clicked. Null when the feature has nothing to offer here.
export function bringChangesEntry(
  projects: ProjectInfo[],
  peers: PeerClient[],
  contextName: string,
): BringChangesEntry | null {
  const rawName = stripMarker(contextName);
  const project = projects.find((p) => !isPeerName(p.name) && p.name === rawName);
  if (!project || project.isRemote) return null;
  const sources = bringChangesSources(projects, peers, rawName);
  if (sources.length === 0) return null;
  const clicked = parsePeerMarker(contextName)?.slug;
  const initialSlug =
    sources.find((s) => s.slug === clicked)?.slug ?? sources[0].slug;
  return { project, sources, initialSlug };
}

const UNITS = ["B", "KB", "MB", "GB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${UNITS[unit]}`;
}
