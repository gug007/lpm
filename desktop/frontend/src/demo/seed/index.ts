import { EMPTY_USAGE, emptyRecap, emptyStats } from "./empty";
import { SAMPLE } from "./sample";
import type { Seed } from "./types";

export const PREVIEW_PROJECT = "myapp";

export interface SeedChoice {
  seed: Seed;
  omit: string[];
  selected?: string;
  // One project, shaped by the config a docs page sends it.
  preview?: boolean;
}

// `?seed=sample` opens the sample workspace (`&omit=a,b` leaves projects out for
// a tour to add); `?config=preview` a fresh install holding one project for a
// config editor to shape; anything else is a fresh install, which leaves out
// every project so the folder picker hands them out.
export function seedFor(params: URLSearchParams): SeedChoice {
  if (params.get("seed") === "sample") {
    const omit = (params.get("omit") ?? "").split(",").filter(Boolean);
    return { seed: SAMPLE, omit, selected: SAMPLE.projects.find((p) => !omit.includes(p.name))?.name };
  }
  const fresh: SeedChoice = {
    seed: { ...SAMPLE, usage: EMPTY_USAGE, stats: emptyStats, recap: emptyRecap },
    omit: SAMPLE.projects.map((p) => p.name),
  };
  if (params.get("config") === "preview") return { ...fresh, selected: PREVIEW_PROJECT, preview: true };
  return fresh;
}
