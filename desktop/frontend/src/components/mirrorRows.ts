import type { FollowState } from "../followApi";
import type { ProjectInfo } from "../types";

// Where each synced folder renders. A mirror belongs to the Mac it mirrors, so it
// shows inside that Mac's section, indented under the remote project it follows —
// but only while that Mac has a section on screen. A local folder must never
// disappear just because the Mac it came from is away.
export interface MirrorPlacement {
  /// slug → the Mac's folder path over there → the local project mirroring it.
  bySlug: Map<string, Map<string, ProjectInfo>>;
  /// Local project names that a peer section will render, so the local list skips
  /// them instead of showing them twice.
  hostedRemotely: Set<string>;
}

export function placeMirrors(
  projects: ProjectInfo[],
  follows: Map<string, FollowState>,
  sectionSlugs: Set<string>,
): MirrorPlacement {
  const bySlug = new Map<string, Map<string, ProjectInfo>>();
  const hostedRemotely = new Set<string>();
  for (const follow of follows.values()) {
    const project = projects.find((p) => p.name === follow.project);
    // A record can outlive its project for a moment after a removal.
    if (!project) continue;
    const byRoot = bySlug.get(follow.slug) ?? new Map<string, ProjectInfo>();
    byRoot.set(follow.sourceRoot, project);
    bySlug.set(follow.slug, byRoot);
    if (sectionSlugs.has(follow.slug)) hostedRemotely.add(project.name);
  }
  return { bySlug, hostedRemotely };
}
