// The computers an automation runs on, from its `machines:` list: hostIds,
// best first, with "any" last for "or any other computer that's on". Config
// sync puts the automation on every computer, so the Automations list, which
// gathers each connected computer's rows, keeps only the one from the computer
// that runs it.

import type { JobInfo } from "./jobsFormat";
import { MACHINE, type machineWords } from "./machineWords";
import { stripMarker } from "./peer/markers";

type Words = ReturnType<typeof machineWords>;

export const ANY_MACHINE = "any";

export function readMachines(value: unknown): string[] {
  const raw = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const ids: string[] = [];
  for (const item of raw) {
    const text = String(item).trim();
    const id = text.toLowerCase() === ANY_MACHINE ? ANY_MACHINE : text;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return withAnyLast(ids);
}

function withAnyLast(ids: string[]): string[] {
  const listed = listedMachines(ids);
  return ids.includes(ANY_MACHINE) ? [...listed, ANY_MACHINE] : listed;
}

export function listedMachines(ids: string[]): string[] {
  return ids.filter((id) => id !== ANY_MACHINE);
}

export function runsOnAny(ids: string[]): boolean {
  return ids.includes(ANY_MACHINE);
}

// A computer joins after the ones already listed, so the order they take the
// job in stays the user's. The last one can go only while any other computer
// may still run it.
export function toggleMachine(ids: string[], id: string): string[] {
  const listed = listedMachines(ids);
  const any = runsOnAny(ids);
  const next = listed.includes(id) ? listed.filter((x) => x !== id) : [...listed, id];
  if (next.length === 0 && !any) return ids;
  return any ? [...next, ANY_MACHINE] : next;
}

// Turning "any" off with no computer listed leaves the job on `fallback`.
export function toggleAnyMachine(ids: string[], fallback: string): string[] {
  const listed = listedMachines(ids);
  if (runsOnAny(ids)) return listed.length > 0 ? listed : [fallback];
  return [...(listed.length > 0 ? listed : [fallback]), ANY_MACHINE];
}

// "This Mac", "Studio or MacBook Pro", "3 Macs", "Any Mac", or "Every Mac" for
// an automation that doesn't name its computers.
export function machinesSummary(
  ids: string[],
  nameOf: (id: string) => string,
  words: Words = MACHINE,
): string {
  if (ids.length === 0) return `Every ${words.Noun}`;
  if (runsOnAny(ids)) return `Any ${words.Noun}`;
  const listed = listedMachines(ids);
  if (listed.length === 1) return nameOf(listed[0]);
  if (listed.length === 2) return `${nameOf(listed[0])} or ${nameOf(listed[1])}`;
  return `${listed.length} ${words.plural}`;
}

// The editor's line under its computers: who runs it, in what order.
export function machinesNote(
  ids: string[],
  nameOf: (id: string) => string,
  words: Words = MACHINE,
): string {
  const listed = listedMachines(ids).map(nameOf);
  if (ids.length === 0) return `Every ${words.noun} that has it runs it, each on its own.`;
  if (runsOnAny(ids)) {
    return listed.length === 0
      ? `One ${words.noun} that has it and is on runs it.`
      : `${listed.join(", then ")} runs it when it's on, otherwise another ${words.noun} that has it.`;
  }
  if (listed.length === 1) return `Only ${listed[0]} runs it.`;
  return `${listed[0]} runs it when it's on, otherwise ${listed.slice(1).join(", then ")}.`;
}

// Where a row's automation runs, for the list: null for one that doesn't name
// its computers. `myId` is this computer's hostId; `aliasOf` names a paired one
// the way this computer knows it.
export function rowMachinesLabel(
  job: JobInfo,
  myId: string,
  aliasOf: (hostId: string) => string | undefined,
  words: Words = MACHINE,
): string | null {
  if (!job.machines) return null;
  const ids = job.machines.map((m) => m.id);
  const nameOf = (id: string) =>
    id === myId
      ? words.ThisMachineTitle
      : aliasOf(id) || job.machines?.find((m) => m.id === id)?.name || words.AnotherMachine;
  return machinesSummary(job.anyMachine ? [...ids, ANY_MACHINE] : ids, nameOf, words);
}

type ListRow = JobInfo & { project?: string };

// The same automation as each computer lists it. A project's name is the same
// on every computer that syncs it.
function sameJobKey(row: ListRow): string {
  return `${row.source ?? ""}|${stripMarker(row.project ?? "")}|${row.id}`;
}

// The copy shown: one from a computer that's connected, then one that's
// running, then the one from the computer earliest in the automation's own order.
function rank(row: ListRow): [number, number, number, string] {
  const ids = (row.machines ?? []).map((m) => m.id);
  const place = row.machineId ? ids.indexOf(row.machineId) : -1;
  return [row.offline ? 1 : 0, row.running ? 0 : 1, place >= 0 ? place : ids.length, row.machineId ?? ""];
}

function before(a: ListRow, b: ListRow): boolean {
  const [ra, rb] = [rank(a), rank(b)];
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] < rb[i];
  }
  return false;
}

export function oneRowPerJob<T extends ListRow>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    if (!row.machines || !row.valid) continue;
    const key = sameJobKey(row);
    const kept = best.get(key);
    if (!kept || before(row, kept)) best.set(key, row);
  }
  return rows.filter((row) => !row.machines || !row.valid || best.get(sameJobKey(row)) === row);
}
