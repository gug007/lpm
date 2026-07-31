// Where a job's definition belongs on disk, and the writes that get it there.
// A job that runs in exactly one project lives in that project's own config —
// the only layer a copy reads — while every wider scope (several projects,
// every project, none) can only be expressed in the shared layer, so changing
// the scope can move the job between layers.

import {
  deleteJob,
  deleteJobGlobal,
  readGlobalJobIds,
  readJobIds,
  saveJob,
  saveJobGlobal,
} from "./jobsConfig";
import { buildJobPayload, type JobDraft, type JobSourceLayer } from "./jobsFormat";
import { slugify } from "./slugify";
import { uniqueKey } from "./uniqueKey";

// The job being edited: the project it runs in and the layer defining it.
export interface EditedJob {
  project: string;
  id: string;
  source: JobSourceLayer;
}

// The one project a draft's scope names, or undefined when it spans several
// projects, every project, or none.
export function scopeProject(draft: JobDraft): string | undefined {
  return !draft.everyProject && draft.targets.length === 1
    ? draft.targets[0]
    : undefined;
}

// The job is written to its new home before it is dropped from the old one, and
// both definitions are identical in between, so a scheduler tick landing
// mid-move still sees exactly one job. Returns the id it was saved under, which
// changes only when the destination layer already uses it for another job.
export async function saveJobDraft(
  draft: JobDraft,
  editing: EditedJob | null,
  // Every job id currently visible — a new job must not take one over, or it
  // would inherit that job's run history.
  visibleIds: string[],
): Promise<string> {
  const payload = buildJobPayload(draft);
  const project = scopeProject(draft);
  const newId = (layerIds: string[]) =>
    uniqueKey(slugify(draft.label) || "job", [...layerIds, ...visibleIds]);

  if (project) {
    // The layer keeps the job's own id as is; any other id it already holds
    // belongs to a different job that must not be clobbered.
    const inPlace =
      editing !== null &&
      editing.source !== "global" &&
      editing.project === project;
    let id = editing?.id ?? "";
    if (!inPlace) {
      const layerIds = await readJobIds(project);
      id = id
        ? layerIds.includes(id)
          ? uniqueKey(id, layerIds)
          : id
        : newId(layerIds);
    }
    await saveJob(project, id, payload);
    if (editing && editing.source === "global") {
      await deleteJobGlobal(editing.id);
    } else if (editing && editing.project !== project) {
      await deleteJob(editing.project, editing.id);
    }
    return id;
  }

  // An omitted `projects` is what "every project" means on disk.
  if (!draft.everyProject) payload.projects = draft.targets;
  const layerIds = await readGlobalJobIds();
  let id = editing?.id ?? "";
  if (!id) {
    id = newId(layerIds);
  } else if (editing!.source !== "global" && layerIds.includes(id)) {
    id = uniqueKey(id, layerIds);
  }
  await saveJobGlobal(id, payload);
  if (editing && editing.source !== "global") {
    await deleteJob(editing.project, editing.id);
  }
  return id;
}
