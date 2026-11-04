// The composer's "@" rows for the other computers an agent here can reach
// (agent_mention_computers, agentmentions.rs): one drill-in row per computer
// whose children are its places — its projects, then its home folder. A place
// inserts its "NAME:PATH" reference as Rust wrote it, with no "@": the agent
// acts on it with `lpm exec --on` and `lpm cp`, still held to that computer's
// policy and to lpm's approval.

import { mentionGroup, type MentionItem } from "./mentions";
import { isPeerRoot } from "./peer/markers";
import type { ProjectInfo } from "./types";

export interface MentionPlace {
  label: string;
  // "NAME:PATH", as the row shows it.
  path: string;
  // The text that takes the typed "@fragment"'s place.
  insert: string;
}

export interface MentionComputer {
  name: string;
  slug: string;
  // What its policy lets this computer's agents do there, in a few words.
  access: string;
  places: MentionPlace[];
}

export interface ComputerRows {
  // One group row per computer, for the bare "@" menu.
  groups: MentionItem[];
  // Every place, for a typed fragment to search.
  places: MentionItem[];
}

function placeItem(place: MentionPlace): MentionItem {
  return {
    kind: "computer",
    label: place.label,
    insert: place.insert,
    detail: place.path,
    search: place.path,
  };
}

// Whether this project's agents run on this computer, the one the other
// computers are reached from: not another computer's project (its agents run
// there) nor an SSH project (they run on the server, without this lpm).
export function runsHere(project: Pick<ProjectInfo, "root" | "isRemote"> | undefined): boolean {
  return !!project && !project.isRemote && !isPeerRoot(project.root);
}

export function computerRows(computers: MentionComputer[]): ComputerRows {
  const groups: MentionItem[] = [];
  const places: MentionItem[] = [];
  for (const c of computers) {
    const group = mentionGroup("computer", c.name, "place", c.places.map(placeItem));
    if (!group) continue;
    groups.push({ ...group, detail: `${c.access} ›` });
    places.push(...group.children!);
  }
  return { groups, places };
}
