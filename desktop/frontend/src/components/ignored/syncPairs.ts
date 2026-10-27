import { isPeerName, parsePeerMarker, peerSlugOf, prefixName, stripMarker } from "../../peer/markers";
import { peerAlias, type PeerClient } from "../../peer/usePeerState";
import type { ProjectInfo } from "../../types";
import type { SyncPair } from "./ignoredSyncApi";

function canSync(peer: PeerClient | undefined): peer is PeerClient {
  return !!peer?.enabled && !!peer.connected && !!peer.supportsIgnoredSync;
}

function pairOf(local: ProjectInfo, remote: ProjectInfo, peer: PeerClient): SyncPair | null {
  const marker = parsePeerMarker(remote.root);
  if (remote.isRemote || marker?.kind !== "root" || marker.slug !== peer.slug) return null;
  return { project: local.name, slug: peer.slug, remoteRoot: marker.raw, machine: peerAlias([peer], peer.slug) };
}

/// The other computers that hold the project named `name` under the same name,
/// each as a pair to sync with. `name` is a local project or one on a paired
/// computer; either way the pair's `project` is the local one. Empty when no
/// connected computer, or this one, has it — or it lives over SSH, where its
/// files aren't on either computer.
export function syncPairsFor(
  name: string,
  projects: ProjectInfo[],
  peers: PeerClient[],
): SyncPair[] {
  const byName = new Map(projects.map((p) => [p.name, p]));
  if (isPeerName(name)) {
    const peer = peers.find((p) => p.slug === peerSlugOf(name));
    const remote = byName.get(name);
    const local = byName.get(stripMarker(name));
    if (!canSync(peer) || !remote || !local || local.isRemote) return [];
    const pair = pairOf(local, remote, peer);
    return pair ? [pair] : [];
  }
  const local = byName.get(name);
  if (!local || local.isRemote) return [];
  return peers.filter(canSync).flatMap((peer) => {
    const remote = byName.get(prefixName(peer.slug, name));
    const pair = remote ? pairOf(local, remote, peer) : null;
    return pair ? [pair] : [];
  });
}
