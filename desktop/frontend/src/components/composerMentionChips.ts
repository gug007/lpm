// Project and copy mentions shown as chips in the composer. A chip stands for
// the exact "@<root>" text a pick inserts (see chipToken), so sending, drafts,
// history and undo all keep that text; only the field shows it as a chip, and
// any rebuild of the field turns the text back into chips here.

import { isPeerRoot } from "../peer/markers";
import { isDuplicate, type ProjectInfo } from "../types";
import { findParentProject, projectDisplayName } from "./ProjectNameDisplay";
import { anchorEditor } from "./composerCanon";
import { isStrayChar } from "./composerDom";
import {
  caretOffsetInSerialized,
  chipIcon,
  createChip,
  FILE_CHIP_LABEL_CLASS,
  placeCaretAtSerializedOffset,
} from "./composerEditor";

export interface MentionChipSpec {
  kind: "project" | "duplicate";
  label: string;
  title: string;
}

// Keyed by the text a pick inserts: "@" + the project's root.
export type MentionChipLookup = Map<string, MentionChipSpec>;

const PROJECT_ICON = chipIcon(
  '<path d="M18 19a5 5 0 0 1-5-5v8"/><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"/><circle cx="13" cy="12" r="2"/><circle cx="20" cy="19" r="2"/>',
);
const COPY_ICON = chipIcon(
  '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
);

export function projectMentionChips(projects: ProjectInfo[]): MentionChipLookup {
  const present = new Set(projects.map((p) => p.name));
  const lookup: MentionChipLookup = new Map();
  for (const p of projects) {
    if (!p.root || isPeerRoot(p.root)) continue;
    const parent = findParentProject(p, projects);
    const copy = isDuplicate(p, present);
    lookup.set(`@${p.root}`, {
      kind: copy ? "duplicate" : "project",
      label: projectDisplayName(p, parent),
      title: copy && parent ? `Copy of ${projectDisplayName(parent)} · ${p.root}` : p.root,
    });
  }
  return lookup;
}

let chipSeq = 0;

// Its data-img is not a number, so nothing looks it up as an attachment.
export function createMentionChip(text: string, spec: MentionChipSpec): HTMLSpanElement {
  const copy = spec.kind === "duplicate";
  const chip = createChip({
    id: `m${(chipSeq += 1)}`,
    cursor: "cursor-default",
    avatar: copy ? COPY_ICON : PROJECT_ICON,
    noun: copy ? "copy" : "project",
    label: spec.label,
    labelClass: FILE_CHIP_LABEL_CLASS,
  });
  chip.dataset.mention = text;
  chip.title = spec.title;
  return chip;
}

const AFTER = /[\s,;:!?)\]}'"]/;

function standsAlone(text: string, start: number, end: number): boolean {
  const prev = text[start - 1];
  if (prev !== undefined && !/[\s([{'"]/.test(prev) && !isStrayChar(prev)) return false;
  const next = text[end];
  if (next === undefined || AFTER.test(next)) return true;
  // A sentence's full stop, not a path going on ("@/repo.git").
  return next === "." && (text[end + 1] === undefined || /\s/.test(text[end + 1]));
}

function findMention(text: string, keys: string[]): { at: number; key: string } | null {
  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    const key = keys.find((k) => text.startsWith(k, at) && standsAlone(text, at, at + k.length));
    if (key) return { at, key };
  }
  return null;
}

// Turn every known project mention written out in the field's text into a
// chip. The serialized value is unchanged, so the caret keeps its offset.
export function chipMentions(root: HTMLElement, lookup: MentionChipLookup): boolean {
  if (lookup.size === 0 || !root.textContent?.includes("@")) return false;
  // Longest first, so a copy's root wins over the original's root it starts with.
  const keys = [...lookup.keys()].sort((a, b) => b.length - a.length);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (parent && parent !== root && parent.closest("[data-img], [data-cmd]")) continue;
    nodes.push(n as Text);
  }
  const caret = caretOffsetInSerialized(root);
  let changed = false;
  for (let node of nodes) {
    for (let hit = findMention(node.data, keys); hit; hit = findMention(node.data, keys)) {
      const mention = node.splitText(hit.at);
      node = mention.splitText(hit.key.length);
      mention.replaceWith(createMentionChip(hit.key, lookup.get(hit.key)!));
      changed = true;
    }
  }
  if (!changed) return false;
  anchorEditor(root);
  if (caret !== null) placeCaretAtSerializedOffset(root, caret);
  return true;
}
