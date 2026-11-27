// Mentions shown as chips in the composer: projects and copies, another
// computer's folder, captured logs, git and GitHub blocks, long pastes and
// quotes, files and branches. A chip stands for the exact text it replaces
// (see chipToken), so sending, drafts, history and undo all keep that text;
// only the field shows it as a chip, and any rebuild of the field turns the
// text back into chips here.

import { isPeerRoot } from "../peer/markers";
import { isDuplicate, type ProjectInfo } from "../types";
import { findParentProject, projectDisplayName } from "./ProjectNameDisplay";
import { anchorEditor } from "./composerCanon";
import {
  CHIP_KINDS,
  chipFailed,
  findChips,
  type Captured,
  type ChipContext,
  type ChipKind,
  type ChipSpec,
} from "./composerChips";
import { chipToken, readParts, partsToText } from "./composerDom";
import {
  caretOffsetInSerialized,
  chipIcon,
  createChip,
  DOC_ICON,
  FILE_CHIP_LABEL_CLASS,
  FOLDER_ICON,
  placeCaretAtSerializedOffset,
} from "./composerEditor";

const ICON: Record<ChipKind, string> = {
  project: chipIcon(
    '<path d="M18 19a5 5 0 0 1-5-5v8"/><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"/><circle cx="13" cy="12" r="2"/><circle cx="20" cy="19" r="2"/>',
  ),
  duplicate: chipIcon(
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ),
  computer: chipIcon('<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>'),
  terminal: chipIcon('<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>'),
  service: chipIcon(
    '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
  ),
  diff: chipIcon('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>'),
  commit: chipIcon('<circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/>'),
  pr: chipIcon('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>'),
  issue: chipIcon('<circle cx="12" cy="12" r="1"/><circle cx="12" cy="12" r="10"/>'),
  paste: chipIcon('<path d="M21 5H3"/><path d="M15 12H3"/><path d="M17 19H3"/>'),
  quote: chipIcon('<path d="M17 5H3"/><path d="M21 12H8"/><path d="M21 19H8"/><path d="M3 12v7"/>'),
  file: DOC_ICON,
  dir: FOLDER_ICON,
  branch: chipIcon('<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>'),
};

const DETAIL_CLASS = "max-w-[180px] truncate font-normal opacity-70";

export function projectMentionChips(projects: ProjectInfo[]): Map<string, ChipSpec> {
  const present = new Set(projects.map((p) => p.name));
  const lookup = new Map<string, ChipSpec>();
  for (const p of projects) {
    if (!p.root || isPeerRoot(p.root)) continue;
    const parent = findParentProject(p, projects);
    const copy = isDuplicate(p, present);
    lookup.set(`@${p.root}`, {
      kind: copy ? "duplicate" : "project",
      label: projectDisplayName(p, parent),
      title: copy && parent ? `Copy of ${projectDisplayName(parent)}` : "Project",
      source: { project: p.name },
    });
  }
  return lookup;
}

let chipSeq = 0;
const mentions = new WeakMap<HTMLElement, Captured>();

// The text a mention chip stands for and what it is, as it was built. Nothing
// for an attachment chip.
export function mentionOf(chip: HTMLElement): Captured | undefined {
  return mentions.get(chip);
}

// Its data-img is not a number, so nothing looks it up as an attachment.
export function createMentionChip(text: string, spec: ChipSpec): HTMLSpanElement {
  const { noun, hue } = CHIP_KINDS[spec.kind];
  const chip = createChip({
    id: `m${(chipSeq += 1)}`,
    cursor: "cursor-pointer",
    avatar: ICON[spec.kind],
    noun,
    label: spec.label,
    labelClass: FILE_CHIP_LABEL_CLASS,
  });
  if (spec.detail) {
    const detail = document.createElement("span");
    detail.className = DETAIL_CLASS;
    detail.textContent = spec.detail;
    chip.appendChild(detail);
  }
  chip.dataset.mention = text;
  if (hue) chip.dataset.hue = hue;
  if (chipFailed(text, spec)) chip.dataset.failed = "true";
  // A block ends in its own line break, so what's typed next starts a new
  // line for the agent; a gap keeps it from touching the chip on screen.
  if (text.endsWith("\n")) chip.classList.add("mr-1.5");
  mentions.set(chip, { text, spec });
  return chip;
}

// Turn every chip written out in the field's text into a chip element. Only
// text between existing chips is rebuilt; the serialized value is unchanged,
// so the caret keeps its offset.
export function chipMentions(root: HTMLElement, ctx: ChipContext): boolean {
  const parts = readParts(root);
  const value = partsToText(parts);
  const matches = value ? findChips(value, ctx) : [];
  if (matches.length === 0) return false;
  const nodes: Node[] = [];
  let changed = false;
  let offset = 0;
  for (const part of parts) {
    if ("chip" in part) {
      nodes.push(part.chip);
      offset += chipToken(part.chip).length;
      continue;
    }
    const end = offset + part.text.length;
    let at = offset;
    for (const m of matches) {
      if (m.start < at || m.end > end) continue;
      if (m.start > at) nodes.push(document.createTextNode(value.slice(at, m.start)));
      nodes.push(createMentionChip(value.slice(m.start, m.end), m.spec));
      at = m.end;
      changed = true;
    }
    if (at < end) nodes.push(document.createTextNode(value.slice(at, end)));
    offset = end;
  }
  if (!changed) return false;
  const caret = caretOffsetInSerialized(root);
  root.replaceChildren(...nodes);
  anchorEditor(root);
  if (caret !== null) placeCaretAtSerializedOffset(root, caret);
  return true;
}
