import { parsePeerMarker, peerSlugOf, stripMarker } from "../peer/markers";
import type { PeerClient } from "../peer/usePeerState";
import type { ProjectInfo } from "../types";

// A project on a paired Mac that can be given a synced folder here.
export interface SyncSource {
  // Its name on that Mac, which the local folder is named after.
  remoteName: string;
  // Host-native absolute path of the folder on that Mac.
  sourceRoot: string;
  slug: string;
}

/// Whether the right-clicked row offers "Sync to This Mac", and with what. Null
/// for anything local, any Mac that is disconnected or on a build that does not
/// speak syncing, and for an SSH project on that Mac — its files do not live
/// there, so its state is not theirs to hand over.
export function syncSourceFor(
  projects: ProjectInfo[],
  peers: PeerClient[],
  contextName: string,
): SyncSource | null {
  const project = projects.find((p) => p.name === contextName);
  if (!project || project.isRemote) return null;
  const slug = peerSlugOf(contextName);
  if (!slug) return null;
  const marker = parsePeerMarker(project.root);
  if (marker?.kind !== "root" || marker.slug !== slug) return null;
  const peer = peers.find((p) => p.slug === slug);
  if (!peer?.connected || !peer.supportsGitFollow) return null;
  return { remoteName: stripMarker(project.name), sourceRoot: marker.raw, slug };
}
