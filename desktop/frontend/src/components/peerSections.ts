import { parsePeerMarker, peerSlugOf, stripMarker } from "../peer/markers";
import { isLinuxHost } from "../peer/platform";
import { peerStatus, type PeerStatus } from "../peer/peerStatus";
import type { FollowState } from "../followApi";
import type { PeerClient } from "../peer/usePeerState";
import type { ProjectInfo } from "../types";

// What each paired Mac's sidebar section holds.
//
// A synced copy is not a project of its own — it is the local half of the remote
// project it mirrors — so it renders as a mark on that project's row rather than
// as a second row in the local list.
//
// It still has to stay reachable: the copy exists to be run and tested here, and
// that must work with the other Mac asleep. So a copy whose remote row is not on
// screen — Mac away, or the folder no longer listed over there — renders as a row
// in that Mac's section instead. Every copy the local list hides is guaranteed one
// of the two, and a copy whose Mac is no longer paired stays in the local list.
export interface MirrorRow {
  /// The local copy the row opens.
  project: ProjectInfo;
  /// What the project is called on the Mac it comes from.
  label: string;
  follow: FollowState;
}

export interface PeerSection {
  slug: string;
  alias: string;
  /// The address behind the alias. Two machines can be named alike, so the
  /// header keeps this in its tooltip rather than spending a line on it.
  host: string;
  connected: boolean;
  /// Which machine this is, for the header's glyph.
  linuxHost: boolean;
  /// How it is doing, resolved here so the header never reaches for the store.
  status: PeerStatus;
  /// The Mac's own project rows; empty while it is away.
  projects: ProjectInfo[];
  /// The Mac's folder path over there → the local copy of it, for the row's mark.
  mirrors: Map<string, ProjectInfo>;
  /// Copies with no remote row to mark, rendered as rows of their own.
  strays: MirrorRow[];
}

export interface SidebarSections {
  sections: PeerSection[];
  /// Local project names a section renders, so the local list skips them.
  hostedRemotely: Set<string>;
}

export function buildPeerSections(
  projects: ProjectInfo[],
  follows: Map<string, FollowState>,
  peers: PeerClient[],
): SidebarSections {
  const byPeer = new Map<string, ProjectInfo[]>();
  for (const project of projects) {
    const slug = peerSlugOf(project.name);
    if (!slug) continue;
    const arr = byPeer.get(slug);
    if (arr) arr.push(project);
    else byPeer.set(slug, [project]);
  }

  // A connected peer always gets a section, even with no projects yet, so its
  // header (and the add-project button in it) is reachable on a fresh host.
  const sections: PeerSection[] = peers.map((peer) => ({
    slug: peer.slug,
    alias: peer.alias || peer.host,
    host: peer.host,
    connected: Boolean(peer.connected),
    linuxHost: isLinuxHost(peer),
    status: peerStatus(peer),
    projects: peer.connected ? (byPeer.get(peer.slug) ?? []) : [],
    mirrors: new Map(),
    strays: [],
  }));
  const bySlug = new Map(sections.map((section) => [section.slug, section]));
  const hostedRemotely = new Set<string>();

  for (const follow of follows.values()) {
    const project = projects.find((p) => p.name === follow.project);
    // A record can outlive its project for a moment after a removal.
    if (!project) continue;
    const section = bySlug.get(follow.slug);
    if (!section) continue;
    hostedRemotely.add(project.name);
    const remoteRow = section.projects.find((p) => stripMarker(p.root) === follow.sourceRoot);
    if (remoteRow) section.mirrors.set(follow.sourceRoot, project);
    else section.strays.push({ project, label: folderName(follow.sourceRoot), follow });
  }

  return {
    sections: sections.filter((section) => section.connected || section.strays.length > 0),
    hostedRemotely,
  };
}

/// The sync a sidebar row belongs to, whichever end of it the row is: a local copy
/// answers by name, a remote project by the folder the copy follows.
export function followForRow(
  follows: Map<string, FollowState>,
  projects: ProjectInfo[],
  rowName: string,
): FollowState | undefined {
  const own = follows.get(rowName);
  if (own) return own;
  const marker = parsePeerMarker(rowName);
  if (marker?.kind !== "name") return undefined;
  const row = projects.find((p) => p.name === rowName);
  if (!row) return undefined;
  const root = stripMarker(row.root);
  for (const follow of follows.values()) {
    if (follow.slug === marker.slug && follow.sourceRoot === root) return follow;
  }
  return undefined;
}

function folderName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
