import YAML from "yaml";
import {
  editGlobalDoc,
  editProjectDoc,
  globalLayer,
  projectLayer,
  repoLayer,
  type ConfigLayer,
} from "./yamlQueue";
import type { JobSourceLayer } from "./jobsFormat";

// Jobs are always project-scoped (see jobs.rs: the registry file wins over the
// repo .lpm.yml and there is no global layer), so every write here targets the
// project registry doc via the same queued read/modify/write seam actions use.

type Doc = ReturnType<typeof YAML.parseDocument>;

const JOBS_SECTION = "jobs";

// ---- pure doc helpers (unit tested) ----------------------------------------

export function readJobPayloadFromDoc(
  doc: Doc,
  id: string,
): Record<string, unknown> | null {
  const jobs = doc.get(JOBS_SECTION, true);
  if (!YAML.isMap(jobs) || !jobs.has(id)) return null;
  const entry = jobs.get(id, true);
  if (!YAML.isMap(entry)) return null;
  return (entry as YAML.YAMLMap).toJSON() as Record<string, unknown>;
}

export function setJobInDoc(
  doc: Doc,
  id: string,
  payload: Record<string, unknown>,
): void {
  let jobs = doc.get(JOBS_SECTION, true);
  if (!YAML.isMap(jobs)) {
    jobs = doc.createNode({});
    doc.set(JOBS_SECTION, jobs);
  }
  (jobs as YAML.YAMLMap).set(id, payload);
}

export function deleteJobFromDoc(doc: Doc, id: string): boolean {
  const jobs = doc.get(JOBS_SECTION, true);
  if (!YAML.isMap(jobs) || !jobs.has(id)) return false;
  (jobs as YAML.YAMLMap).delete(id);
  if ((jobs as YAML.YAMLMap).items.length === 0) doc.delete(JOBS_SECTION);
  return true;
}

export function jobIdsInDoc(doc: Doc): string[] {
  const jobs = doc.get(JOBS_SECTION, true);
  if (!YAML.isMap(jobs)) return [];
  return (jobs as YAML.YAMLMap).items
    .map((item) => {
      const key = item.key;
      return YAML.isScalar(key) ? String(key.value) : String(key);
    })
    .filter(Boolean);
}

// ---- bridge-backed operations ----------------------------------------------

// The registry doc's existing job ids, so a new job's id can avoid colliding
// with one already declared there.
export async function readJobIds(projectName: string): Promise<string[]> {
  const content = await projectLayer(projectName).read();
  return jobIdsInDoc(YAML.parseDocument(content || "{}"));
}

function layerFor(projectName: string, source: JobSourceLayer): ConfigLayer {
  if (source === "global") return globalLayer;
  if (source === "repo") return repoLayer(projectName);
  return projectLayer(projectName);
}

export async function readJobPayloadFrom(
  projectName: string,
  source: JobSourceLayer,
  id: string,
): Promise<Record<string, unknown> | null> {
  const content = await layerFor(projectName, source).read();
  return readJobPayloadFromDoc(YAML.parseDocument(content || "{}"), id);
}

export async function readGlobalJobIds(): Promise<string[]> {
  const content = await globalLayer.read();
  return jobIdsInDoc(YAML.parseDocument(content || "{}"));
}

export async function saveJobGlobal(
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await editGlobalDoc((doc) => setJobInDoc(doc, id, payload));
}

export async function deleteJobGlobal(id: string): Promise<void> {
  await editGlobalDoc((doc) => {
    deleteJobFromDoc(doc, id);
  });
}

export async function saveJob(
  projectName: string,
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await editProjectDoc(projectName, (doc) => setJobInDoc(doc, id, payload));
}

export async function deleteJob(projectName: string, id: string): Promise<void> {
  await editProjectDoc(projectName, (doc) => {
    deleteJobFromDoc(doc, id);
  });
}
