// Composer edits WebKit gets wrong around atomic chips and line breaks, done on
// the canonical flat DOM (composerCanon.ts) instead: deleting a line break or a
// character behind a caret anchor, stepping and extending over chips and
// anchors, inserting a line break, and the macOS ⌃A/⌃E/⌃K/⌃Y line edits, which
// WebKit stops at every chip. Each edit notifies the field like typing would.

import { chipToken, isChip, isStrayChar, notifyEdit, partsToText, pointOffset, readParts, stripStray } from "./composerDom";
import {
  canonicalizeEditor,
  canonicalizeSelection,
  rangeForOffsets,
  setCaretAtOffset,
} from "./composerCanon";
import type { ComposerClipboardPayload } from "./composerClipboard";

type Dir = "backward" | "forward";
type Leaf = Text | HTMLElement;

export type ComposerUnit = { kind: "chip"; chip: HTMLElement } | { kind: "newline" } | { kind: "char" };

// The first visible thing beside a point, and whether invisible anchors lie
// between the point and it.
export interface AdjacentUnit {
  unit: ComposerUnit | null;
  stray: boolean;
}

function leavesOf(root: HTMLElement): Leaf[] {
  const out: Leaf[] = [];
  const walk = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE || isChip(node)) out.push(node as Leaf);
      else if (node instanceof HTMLElement) walk(node);
    }
  };
  walk(root);
  return out;
}

// A point as (leaf index, position): a character index in a text leaf, or 0/1
// for before/after a chip.
function cursorOf(lv: Leaf[], node: Node, offset: number): { i: number; c: number } {
  const own = lv.indexOf(node as Leaf);
  if (own >= 0 && node.nodeType === Node.TEXT_NODE) return { i: own, c: offset };
  const chipIdx = lv.findIndex((l) => isChip(l) && (l === node || l.contains(node)));
  if (chipIdx >= 0) return { i: chipIdx, c: lv[chipIdx] === node && offset === 0 ? 0 : 1 };
  const child = node.childNodes[offset];
  if (child) {
    const i = lv.findIndex((l) => l === child || child.contains(l));
    if (i >= 0) return { i, c: 0 };
  }
  let last = -1;
  lv.forEach((l, i) => {
    if (node.contains(l)) last = i;
  });
  if (last >= 0) {
    const leaf = lv[last];
    return { i: last, c: isChip(leaf) ? 1 : (leaf as Text).data.length };
  }
  return { i: lv.length, c: 0 };
}

export function unitAt(root: HTMLElement, node: Node, offset: number, dir: Dir): AdjacentUnit {
  const lv = leavesOf(root);
  const cur = cursorOf(lv, node, offset);
  let stray = false;
  const charUnit = (ch: string): ComposerUnit => (ch === "\n" ? { kind: "newline" } : { kind: "char" });
  if (dir === "forward") {
    for (let j = cur.i; j < lv.length; j++) {
      const leaf = lv[j];
      if (isChip(leaf)) {
        if (j === cur.i && cur.c === 1) continue;
        return { unit: { kind: "chip", chip: leaf }, stray };
      }
      const data = (leaf as Text).data;
      for (let k = j === cur.i ? cur.c : 0; k < data.length; k++) {
        if (isStrayChar(data[k])) stray = true;
        else return { unit: charUnit(data[k]), stray };
      }
    }
  } else {
    for (let j = Math.min(cur.i, lv.length - 1); j >= 0; j--) {
      const leaf = lv[j];
      if (isChip(leaf)) {
        if (j === cur.i && cur.c === 0) continue;
        return { unit: { kind: "chip", chip: leaf }, stray };
      }
      const data = (leaf as Text).data;
      for (let k = (j === cur.i ? cur.c : data.length) - 1; k >= 0; k--) {
        if (isStrayChar(data[k])) stray = true;
        else return { unit: charUnit(data[k]), stray };
      }
    }
  }
  return { unit: null, stray };
}

// The unit beside a collapsed caret in the field, or null without one.
export function adjacentUnit(root: HTMLElement, dir: Dir): AdjacentUnit | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode || !root.contains(sel.anchorNode)) return null;
  return unitAt(root, sel.anchorNode, sel.anchorOffset, dir);
}

export function chipBeside(root: HTMLElement, dir: Dir): HTMLElement | null {
  const adj = adjacentUnit(root, dir);
  return adj?.unit?.kind === "chip" ? adj.unit.chip : null;
}

function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode || !root.contains(sel.anchorNode)) return null;
  return pointOffset(root, sel.anchorNode, sel.anchorOffset);
}

function valueOf(root: HTMLElement): string {
  return partsToText(readParts(root));
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

// Code-unit length of the grapheme ending (backward) or starting (forward) at `at`.
function graphemeLength(value: string, at: number, dir: Dir): number {
  if (!segmenter) return 1;
  for (const seg of segmenter.segment(value)) {
    const end = seg.index + seg.segment.length;
    if (dir === "backward" && end === at) return seg.segment.length;
    if (dir === "forward" && seg.index === at) return seg.segment.length;
  }
  return 1;
}

function deleteOffsets(root: HTMLElement, from: number, to: number, inputType: string): void {
  rangeForOffsets(root, from, to).deleteContents();
  setCaretAtOffset(root, from);
  notifyEdit(root, inputType);
}

// Backspace (backward) / Delete (forward) at a collapsed caret when the unit is
// a line break or sits behind an anchor — native deletion would merge WebKit's
// line blocks across the chip, or just eat the invisible anchor. Chips are left
// to the caller, which also forgets their path. Returns whether it handled the
// key.
export function deleteBeside(root: HTMLElement, dir: Dir): boolean {
  const adj = adjacentUnit(root, dir);
  if (!adj || adj.unit?.kind === "chip") return false;
  if (!adj.unit) return adj.stray;
  if (adj.unit.kind === "char" && !adj.stray) return false;
  const at = caretOffset(root);
  if (at === null) return false;
  const len = adj.unit.kind === "newline" ? 1 : graphemeLength(valueOf(root), at, dir);
  if (dir === "backward") deleteOffsets(root, at - len, at, "deleteContentBackward");
  else deleteOffsets(root, at, at + len, "deleteContentForward");
  return true;
}

function selectionRange(root: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return range;
}

// Delete a selection that spans a chip or a line break through the DOM, so
// WebKit can't leave a placeholder line behind (as it does when a deletion
// leaves a chip at a line start). Returns whether it handled the key.
export function deleteSelection(root: HTMLElement, inputType = "deleteContentBackward"): boolean {
  const range = selectionRange(root);
  if (!range) return false;
  const frag = range.cloneContents();
  if (!frag.querySelector("[data-img]") && !stripStray(frag.textContent ?? "").includes("\n")) return false;
  const from = pointOffset(root, range.startContainer, range.startOffset);
  range.deleteContents();
  setCaretAtOffset(root, from);
  notifyEdit(root, inputType);
  return true;
}

// ←/→ beside a chip or an anchor: hop over the chip (or the anchor and the
// character behind it) in one press. Returns whether it moved the caret.
export function stepCaret(root: HTMLElement, dir: Dir): boolean {
  const adj = adjacentUnit(root, dir);
  if (!adj?.unit) return false;
  const at = caretOffset(root);
  if (at === null) return false;
  if (adj.unit.kind === "chip") {
    const token = chipToken(adj.unit.chip).length;
    setCaretAtOffset(root, dir === "backward" ? at - token : at + token);
    return true;
  }
  if (!adj.stray) return false;
  const len = adj.unit.kind === "newline" ? 1 : graphemeLength(valueOf(root), at, dir);
  setCaretAtOffset(root, dir === "backward" ? at - len : at + len);
  return true;
}

// ⇧←/⇧→: extend by one visible unit, never stopping on an invisible anchor, and
// leave the ends on canonical points so a selection starting at a chip paints
// the chip rather than the word before it.
export function extendSelection(root: HTMLElement, dir: Dir): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.focusNode || !root.contains(sel.focusNode)) return false;
  const before = pointOffset(root, sel.focusNode, sel.focusOffset);
  for (let n = 0; n < 4; n++) {
    sel.modify("extend", dir, "character");
    if (!sel.focusNode || pointOffset(root, sel.focusNode, sel.focusOffset) !== before) break;
  }
  canonicalizeSelection(root, true);
  return true;
}

// Insert `text` (which may hold line breaks) at the caret, replacing any
// selection. WebKit's own insertText turns each "\n" into a new <div> line.
export function insertPlainText(root: HTMLElement, text: string, inputType = "insertText"): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  let range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    setCaretAtOffset(root, valueOf(root).length);
    range = sel.getRangeAt(0);
  }
  const from = pointOffset(root, range.startContainer, range.startOffset);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  canonicalizeEditor(root);
  setCaretAtOffset(root, from + text.length);
  notifyEdit(root, inputType);
}

export function insertLineBreak(root: HTMLElement): void {
  insertPlainText(root, "\n", "insertLineBreak");
}

// The caret's logical line in the value: [start, end) between line breaks.
function logicalLine(root: HTMLElement): { at: number; start: number; end: number; value: string } | null {
  const at = caretOffset(root);
  if (at === null) return null;
  const value = valueOf(root);
  const nl = value.indexOf("\n", at);
  return { at, start: value.lastIndexOf("\n", at - 1) + 1, end: nl === -1 ? value.length : nl, value };
}

// ⌃A / ⌃E: the start or end of the caret's line, across any chips on it.
export function moveToLineEdge(root: HTMLElement, dir: Dir): boolean {
  const line = logicalLine(root);
  if (!line) return false;
  setCaretAtOffset(root, dir === "backward" ? line.start : line.end);
  return true;
}

// The text ⌃K last killed, for ⌃Y — shared by every composer, like the
// system's own kill buffer.
let killed: ComposerClipboardPayload | null = null;

// ⌃K: delete to the end of the line — the line break itself when already there —
// keeping the killed text (and its chips) for ⌃Y.
export function killToLineEnd(
  root: HTMLElement,
  payloadOf: (frag: DocumentFragment) => ComposerClipboardPayload,
): boolean {
  const line = logicalLine(root);
  if (!line) return false;
  const end = line.at === line.end && line.end < line.value.length ? line.end + 1 : line.end;
  if (end === line.at) return true;
  killed = payloadOf(rangeForOffsets(root, line.at, end).cloneContents());
  deleteOffsets(root, line.at, end, "deleteSoftLineForward");
  return true;
}

export function lastKill(): ComposerClipboardPayload | null {
  return killed;
}

// Ctrl+K / Ctrl+U off macOS: delete to the visual line's end or start (the line
// break itself when already there) through the DOM, like ⌃K.
export function killToLineBoundary(root: HTMLElement, dir: Dir): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode || !root.contains(sel.anchorNode)) return false;
  if (sel.isCollapsed) {
    sel.modify("extend", dir, "lineboundary");
    if (sel.isCollapsed) sel.modify("extend", dir, "character");
  }
  const range = selectionRange(root);
  if (!range) return true;
  const from = pointOffset(root, range.startContainer, range.startOffset);
  range.deleteContents();
  setCaretAtOffset(root, from);
  notifyEdit(root, dir === "backward" ? "deleteSoftLineBackward" : "deleteSoftLineForward");
  return true;
}
