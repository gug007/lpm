// DOM helpers for the contentEditable terminal composer. Image references are
// rendered as atomic, non-editable "chips" so a token can only be selected or
// removed as a whole — never split mid-text — and serialized back to the
// `[Image #N]` placeholders the rest of the app expects. The field's DOM is kept
// flat and anchored around chips (composerCanon.ts).

import { basename } from "../path";
import { isImagePath } from "../composerValue";
import { ansiColors } from "./terminal-utils";
import type { ComposerClipboardPayload } from "./composerClipboard";
import {
  chipToken,
  isChip,
  isStrayOnly,
  partsToText,
  pointOffset,
  readParts,
  serializedPrefix,
} from "./composerDom";
import {
  anchorEditor,
  canonicalizeEditor,
  canonicalizeSelection,
  setCaretAtOffset,
} from "./composerCanon";
import { adjacentUnit, chipBeside, insertPlainText, unitAt } from "./composerEditKeys";

export { EMPTY_COMPOSER, isImagePath } from "../composerValue";
export type { ComposerImage, ComposerValue } from "../composerValue";

// The same blue the terminal renders a recognized slash command in (xterm's
// bright-blue), so the composer's highlight matches what the CLI shows.
export const COMMAND_COLOR = ansiColors.brightBlue;

const IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g;

// Shared visual base for an image chip, so the editable composer chip and the
// read-only history chip (MessageImageChip) can't drift apart. Each site layers
// its own interaction classes (group/cursor/hover) on top.
const IMAGE_CHIP_BASE_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg bg-[#38bdf8]/20 py-0.5 pl-0.5 pr-2 align-middle text-[12px] font-medium leading-4 text-[#38bdf8]";
export const IMAGE_CHIP_CLASS = `select-none ${IMAGE_CHIP_BASE_CLASS}`;
export const IMAGE_CHIP_THUMB_CLASS =
  "relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-md bg-[var(--bg-secondary)] ring-1 ring-inset ring-black/15";
// A file chip's label is the dropped file's basename, which can run long; cap its
// width and ellipsize so one long name never stretches the pill across the
// composer. Shared with the read-only history mirror (MessageFileChip) so the
// editable and rendered chips truncate identically.
export const FILE_CHIP_LABEL_CLASS = "max-w-[160px] truncate";

// A labeled image token, like the CLIs' inline "[Image #N]" — kept as an "Image
// N" pill, modernized: a real thumbnail avatar leads (a muted glyph until it
// loads via setChipThumbnail). Hovering the chip swaps the avatar for a remove
// "×" overlay — click it to drop the attachment; click the label to preview it.
// Unlike the history chip it stays selectable, so a selection over it paints the
// chip as selected.
const CHIP_CLASS = `group ${IMAGE_CHIP_BASE_CLASS} cursor-zoom-in transition-colors hover:bg-[#38bdf8]/30`;

const THUMB_CLASS = `${IMAGE_CHIP_THUMB_CLASS} cursor-pointer text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-red)]`;

// The image (and the loading glyph) fade out on hover so the "×" shows in their
// place over the avatar's plain background. The overlay stays mounted and
// cross-fades on opacity so the swap is smooth, in step with the image's fade.
const REMOVE_OVERLAY_CLASS =
  "absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100";

const PLACEHOLDER_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="transition-opacity group-hover:opacity-0"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-5-5L7 21"/></svg>';
// Resting avatar glyphs for a non-image attachment chip, by file category. Same
// stroke style and hover-fade as PLACEHOLDER_ICON so the "×" overlay reads over them.
const DOC_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="transition-opacity group-hover:opacity-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
const VIDEO_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="transition-opacity group-hover:opacity-0"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>';
const AUDIO_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="transition-opacity group-hover:opacity-0"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
const FOLDER_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="transition-opacity group-hover:opacity-0"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|avi|m4v|flv|wmv|mpe?g)$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|aiff?)$/i;

function fileIconSvg(path: string): string {
  if (VIDEO_EXT_RE.test(path)) return VIDEO_ICON;
  if (AUDIO_EXT_RE.test(path)) return AUDIO_ICON;
  return DOC_ICON;
}

const REMOVE_ICON =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

export function createImageChip(n: number): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.dataset.img = String(n);
  chip.contentEditable = "false";
  chip.className = CHIP_CLASS;
  chip.innerHTML =
    `<span data-img-remove="${n}" data-img-thumb role="button" aria-label="Remove image" title="Remove image" class="${THUMB_CLASS}">` +
    `<span data-img-ph class="absolute inset-0 flex items-center justify-center text-[var(--text-muted)]">${PLACEHOLDER_ICON}</span>` +
    `<span class="${REMOVE_OVERLAY_CLASS}">${REMOVE_ICON}</span>` +
    `</span>` +
    `<span data-img-label>Image ${n}</span>`;
  return chip;
}

// Re-skin an image chip (createImageChip) as a generic file attachment: a
// file-type glyph and the file's basename replace the thumbnail avatar and the
// "Image N" label. The `[Image #N]` token, the path map, and the remove/cut/
// preview behavior are shared with image chips — only the resting look differs,
// so a dropped .txt/.mp4 still resolves to its path on send. Idempotent.
export function renderFileChip(chip: HTMLElement, path: string): void {
  if (chip.dataset.file === "1") return;
  chip.dataset.file = "1";
  const label = chip.querySelector<HTMLElement>("[data-img-label]");
  if (label) {
    label.textContent = basename(path);
    label.title = path;
    label.classList.add(...FILE_CHIP_LABEL_CLASS.split(" "));
  }
  const ph = chip.querySelector<HTMLElement>("[data-img-ph]");
  if (ph) ph.innerHTML = fileIconSvg(path);
  const remove = chip.querySelector<HTMLElement>("[data-img-remove]");
  if (remove) {
    remove.setAttribute("aria-label", "Remove file");
    remove.setAttribute("title", "Remove file");
  }
}

// A file chip whose path turned out to be a folder takes the folder glyph.
export function renderFolderChip(chip: HTMLElement): void {
  const ph = chip.querySelector<HTMLElement>("[data-img-ph]");
  if (ph) ph.innerHTML = FOLDER_ICON;
  chip.querySelector("[data-img-remove]")?.setAttribute("title", "Remove folder");
}

// Number the image chips 1, 2, 3… in field order. The "[Image #N]" token stays
// the attachment's stable id; the label is only what the user reads, so it
// restarts with every prompt and isn't consumed by non-image files.
export function relabelImageChips(root: HTMLElement, isImage: (chip: HTMLElement) => boolean): void {
  let n = 0;
  root.querySelectorAll<HTMLElement>("[data-img]").forEach((chip) => {
    if (chip.dataset.file === "1" || !isImage(chip)) return;
    n += 1;
    const label = chip.querySelector<HTMLElement>("[data-img-label]");
    if (label && label.textContent !== `Image ${n}`) label.textContent = `Image ${n}`;
  });
}

// Fill a chip's thumbnail avatar with its loaded image, dropping the placeholder
// glyph. The <img> sits under the hover "×" overlay and ignores pointer events,
// so a click resolves to the avatar (remove). No-op if already set.
export function setChipThumbnail(chip: HTMLElement, dataUrl: string): void {
  const slot = chip.querySelector<HTMLElement>("[data-img-thumb]");
  if (!slot || slot.querySelector("img")) return;
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "";
  img.draggable = false;
  img.className =
    "pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity group-hover:opacity-0";
  const ph = slot.querySelector<HTMLElement>("[data-img-ph]");
  // A file named like an image that doesn't decode keeps the image glyph rather
  // than WebKit's broken-image box.
  img.onerror = () => {
    img.remove();
    if (ph && !ph.isConnected) slot.insertBefore(ph, slot.firstChild);
  };
  slot.insertBefore(img, slot.firstChild);
  ph?.remove();
}

// True when the field shows nothing at all (drives the placeholder). Uses the
// live DOM rather than serialize() so a WebKit leftover empty block (e.g.
// `<div><br></div>` after clearing) still counts as empty.
export function isEditorEmpty(root: HTMLElement): boolean {
  return (
    isStrayOnly(root.textContent ?? "") && !root.querySelector("[data-img]")
  );
}

// Rebuild the plain-text value: text verbatim (minus stray characters and caret
// anchors), chips as `[Image #N]`, line breaks as "\n" (readParts' rules). Also
// serializes a selection fragment cloned out of the editor
// (selectionClipboardPayload).
export function serializeEditor(root: HTMLElement | DocumentFragment): string {
  return partsToText(readParts(root));
}

// Split a serialized value into ordered segments of plain text and image tokens
// (image === the token's number, or null for a text run). Used to rebuild the
// editor and to break a draft into parts for sending.
export interface ValueSegment {
  text: string;
  image: number | null;
}
export function splitByImageTokens(value: string): ValueSegment[] {
  const segments: ValueSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  IMAGE_TOKEN_RE.lastIndex = 0;
  while ((m = IMAGE_TOKEN_RE.exec(value))) {
    if (m.index > last)
      segments.push({ text: value.slice(last, m.index), image: null });
    segments.push({ text: m[0], image: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < value.length)
    segments.push({ text: value.slice(last), image: null });
  return segments;
}

// The current selection as a clipboard payload — its serialized text (chips as
// `[Image #N]` tokens) plus the token→path map for the chips it spans. Null when
// the selection is collapsed, outside `root`, or holds no chips (native copy
// already handles a text-only selection).
export function selectionClipboardPayload(
  root: HTMLElement,
  imagePaths: Map<number, string>,
): ComposerClipboardPayload | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null;
  const frag = range.cloneContents();
  if (!frag.querySelector("[data-img]")) return null;
  return fragmentClipboardPayload(frag, imagePaths);
}

// A cloned piece of the editor as a clipboard payload: its serialized text plus
// the token→path map for the chips it holds.
export function fragmentClipboardPayload(
  frag: DocumentFragment,
  imagePaths: Map<number, string>,
): ComposerClipboardPayload {
  const text = serializeEditor(frag);
  const images: Record<string, string> = {};
  for (const seg of splitByImageTokens(text)) {
    if (seg.image === null) continue;
    const path = imagePaths.get(seg.image);
    if (path) images[seg.image] = path;
  }
  return { text, images };
}

// Rebuild a pasted payload as insertable items: text runs verbatim, each mapped
// token as a fresh chip minted by `registerPath` — fresh numbers, so a paste
// into another composer can't collide with (or hijack) its existing tokens. A
// token with no path stays literal text.
export function payloadToItems(
  payload: ComposerClipboardPayload,
  registerPath: (path: string) => HTMLSpanElement,
): Array<HTMLSpanElement | string> {
  return splitByImageTokens(payload.text)
    .map((seg) => {
      const path = seg.image === null ? undefined : payload.images[seg.image];
      return path ? registerPath(path) : seg.text;
    })
    .filter((item) => typeof item !== "string" || item.length > 0);
}

// Rebuild the editor from a plain-text value, turning any `[Image #N]` tokens
// back into chips (used when recalling history).
export function setEditorContent(root: HTMLElement, value: string): void {
  root.replaceChildren();
  if (!value) return;
  for (const seg of splitByImageTokens(value)) {
    root.appendChild(
      seg.image === null
        ? document.createTextNode(seg.text)
        : createImageChip(seg.image),
    );
  }
  anchorEditor(root);
}

export function presentImageTokens(root: HTMLElement): Set<number> {
  const present = new Set<number>();
  root.querySelectorAll<HTMLElement>("[data-img]").forEach((el) => {
    const n = Number(el.dataset.img);
    if (!Number.isNaN(n)) present.add(n);
  });
  return present;
}

const needsSpace = (ch: string | undefined) => ch !== undefined && !/\s/.test(ch);

// Insert chips and/or text at the caret (falling back to the end of the field
// when the selection is elsewhere, e.g. an OS drop). Items are space-separated,
// and a dropped chip gets a space from a word it would otherwise touch on either
// side; no trailing space is added at a line end, so a single Backspace right
// after a chip removes the whole chip instead of first eating a phantom space.
// Paste reconstruction passes `separate: false` to keep its segment runs
// verbatim — except two adjacent chips still get a separating space, so their
// tokens never serialize touching (whose resolved paths would concatenate on
// send).
export function insertItemsAtCaret(
  root: HTMLElement,
  items: Array<HTMLElement | string>,
  separate = true,
): void {
  if (items.length === 0) return;
  // Whether the field owns focus. A paste/drop whose image save resolved after
  // the user moved focus away must not yank it back.
  const focused = () =>
    root === document.activeElement || root.contains(document.activeElement);
  const hadFocus = focused();
  const sel = window.getSelection();
  let range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  if (!range || !root.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.deleteContents();
  const start = pointOffset(root, range.startContainer, range.startOffset);

  const isItemChip = (item: HTMLElement | string | undefined) =>
    item instanceof HTMLElement && item.dataset.img !== undefined;
  const before = unitAt(root, range.startContainer, range.startOffset, "backward").unit;
  const after = unitAt(root, range.startContainer, range.startOffset, "forward").unit;
  const value = serializeEditor(root);
  const leadSpace = isItemChip(items[0])
    ? before?.kind === "chip" || (separate && needsSpace(value[start - 1]))
    : false;
  const lastItem = items[items.length - 1];
  const trailSpace = isItemChip(lastItem)
    ? after?.kind === "chip" || (separate && needsSpace(value[start]))
    : false;

  const frag = document.createDocumentFragment();
  if (leadSpace) frag.appendChild(document.createTextNode(" "));
  let prevWasChip = false;
  let length = leadSpace ? 1 : 0;
  items.forEach((item, i) => {
    const itemIsChip = isItemChip(item);
    if (i > 0 && (separate || (prevWasChip && itemIsChip))) {
      frag.appendChild(document.createTextNode(" "));
      length += 1;
    }
    frag.appendChild(typeof item === "string" ? document.createTextNode(item) : item);
    length += typeof item === "string" ? item.length : chipToken(item).length;
    prevWasChip = itemIsChip;
  });
  if (trailSpace) frag.appendChild(document.createTextNode(" "));
  range.insertNode(frag);
  anchorEditor(root);

  const caretAt = start + length;
  const placeCaret = () => {
    // Don't pull focus back to a field the user has since left (a late async
    // image save); callers that own the drop focus it before inserting.
    if (!hadFocus && !focused()) return;
    // Focus first: after an unfocused OS drop WebKit ignores a programmatic
    // selection until the field is focused.
    root.focus();
    setCaretAtOffset(root, caretAt);
  };
  placeCaret();
  // The drop focuses the field late; re-applying once layout settles makes the
  // painted caret match the (already correct) selection.
  if (hadFocus) requestAnimationFrame(() => {
    if (serializeEditor(root).length >= caretAt) placeCaret();
  });
}

// Select a whole chip so a click highlights all of it (and a following
// Backspace/Delete removes it as a unit).
export function selectChip(chip: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNode(chip);
  sel.removeAllRanges();
  sel.addRange(range);
}

// The chip when the selection spans exactly one chip and nothing else (the
// state selectChip leaves behind on a body click). WebKit collapses such a
// selection on the first Backspace/Delete instead of removing the atomic chip,
// so the composer deletes it explicitly. A selection mixing real text with a
// chip returns null and keeps native deletion.
export function selectedChip(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null;
  const frag = range.cloneContents();
  let chips = 0;
  for (const node of Array.from(frag.childNodes)) {
    if (isChip(node)) chips += 1;
    else if (node.nodeType !== Node.TEXT_NODE || !isStrayOnly(node.nodeValue ?? "")) return null;
  }
  if (chips !== 1) return null;
  const n = frag.querySelector<HTMLElement>("[data-img]")?.dataset.img;
  return n != null
    ? root.querySelector<HTMLElement>(`[data-img="${n}"]`)
    : null;
}

// Remove a chip and leave a collapsed caret where it was.
export function removeChip(chip: HTMLElement): void {
  const root = chip.closest<HTMLElement>("[contenteditable='true']");
  if (!root) {
    chip.remove();
    return;
  }
  const at = pointOffset(root, chip, 0);
  chip.remove();
  setCaretAtOffset(root, at);
}

// The chip immediately before a collapsed caret, if any (for Backspace). Caret
// anchors between them don't count.
export function chipBeforeCaret(root: HTMLElement): HTMLElement | null {
  return chipBeside(root, "backward");
}

// The chip immediately after a collapsed caret, if any (for Delete). At the very
// end of the field, past a trailing chip, nothing real lies ahead, so
// forward-Delete targets the chip behind the caret — symmetric with Backspace.
export function chipAfterCaret(root: HTMLElement): HTMLElement | null {
  const ahead = adjacentUnit(root, "forward");
  if (!ahead) return null;
  if (ahead.unit?.kind === "chip") return ahead.unit.chip;
  if (ahead.unit) return null;
  return chipBeside(root, "backward");
}

export interface CaretEdges {
  collapsed: boolean;
  atStart: boolean;
  atEnd: boolean;
}

// Whether the caret sits at the very start/end of the field — used to decide
// when Arrow Up/Down should recall history instead of moving the caret.
export function caretEdges(root: HTMLElement): CaretEdges {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0)
    return { collapsed: false, atStart: false, atEnd: false };
  const range = sel.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return { collapsed: false, atStart: false, atEnd: false };
  }
  const start = pointOffset(root, range.startContainer, range.startOffset);
  const end = pointOffset(root, range.endContainer, range.endOffset);
  return {
    collapsed: sel.isCollapsed,
    atStart: start === 0,
    atEnd: end === serializeEditor(root).length,
  };
}

export function placeCaretAtEnd(root: HTMLElement): void {
  setCaretAtOffset(root, serializeEditor(root).length);
}

// Post-mutation hygiene in one call: fold WebKit's line blocks back into flat
// text, keep the caret anchors beside chips, and seat the caret on a canonical
// point. Returns whether the DOM or the caret moved, so callers persist the
// draft only when something changed.
export function normalizeComposer(root: HTMLElement): boolean {
  return canonicalizeEditor(root);
}

// After a click or a finished selection gesture: move a caret (or a range end)
// off a spot WebKit mispaints — flush against a chip, or inside one.
export function settleSelection(root: HTMLElement): boolean {
  return canonicalizeSelection(root, true);
}

// A chip's stand-in on a computed line: one object-replacement char — a non-space
// boundary that lets an "@" or "/" typed right after a chip trigger its menu (see
// MENTION_TRIGGER and SLASH_TRIGGER), without dragging in the chip's "Image N"
// label. It's in STRAY_CHARS_RE, so real typed text can never contain one, and
// serializedPrefix adds it directly (not via a text node), so the strip that
// clears residue leaves it intact.
const LINE_CHIP_PLACEHOLDER = "￼";

// The serialized prefix up to a collapsed caret inside the field (chips as
// `chipText`), or null without one. Range.toString() can't stand in: it folds in
// a chip's "Image N" label and the caret anchors, and emits no "\n" for a <br> or
// a block boundary.
function serializedPrefixToCaret(
  root: HTMLElement,
  chipText: (chip: HTMLElement) => string,
): string | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.endContainer)) return null;
  return serializedPrefix(root, r.endContainer, r.endOffset, chipText);
}

// The caret's line — from the last break up to a collapsed caret — which the
// slash- and mention-triggers inspect. Null unless the selection is a collapsed
// caret inside the field. Each chip counts as one LINE_CHIP_PLACEHOLDER; the line
// is what follows the last "\n".
export function lineBeforeCaret(root: HTMLElement): string | null {
  const out = textBeforeCaret(root);
  return out === null ? null : out.slice(out.lastIndexOf("\n") + 1);
}

// Everything from the field start up to a collapsed caret, chips as in
// lineBeforeCaret — for triggers that need to know where the prompt begins.
export function textBeforeCaret(root: HTMLElement): string | null {
  return serializedPrefixToCaret(root, () => LINE_CHIP_PLACEHOLDER);
}

// The caret's position as an offset into the value serializeEditor would produce
// — the offset space the composer's undo snapshots store. Each chip counts as its
// full "[Image #N]" token and each break as one "\n", so the offset pairs 1:1
// with the serialized text and survives the rebuild that restores it.
export function caretOffsetInSerialized(root: HTMLElement): number | null {
  const out = serializedPrefixToCaret(root, chipToken);
  return out === null ? null : out.length;
}

// Seat the caret at a serialized-text offset (caretOffsetInSerialized's inverse).
// An offset that lands inside a chip's "[Image #N]" token seats the caret
// immediately after the chip (a non-editable atom has no interior position);
// one past the content seats it at the field end.
export function placeCaretAtSerializedOffset(
  root: HTMLElement,
  offset: number,
): void {
  setCaretAtOffset(root, offset);
}

// WebKit's Selection.modify("extend", "backward", "character") steps by grapheme
// cluster, not UTF-16 code unit, so a fragment holding a surrogate-pair emoji or a
// combining cluster (e.g. "@🎉x") must be measured in graphemes — a code-unit
// count over-extends the selection one position past the trigger, and the
// following execCommand("insertText") then overwrites the preceding character.
const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

export function graphemeCount(s: string): number {
  if (!graphemeSegmenter) return s.length;
  return Array.from(graphemeSegmenter.segment(s)).length;
}

// Replace the "/<frag>" preceding the caret on the current line with "/<name> ",
// leaving the caret after the trailing space ready for arguments. The fragment
// may sit mid-line: SLASH_TRIGGER admits no "/" inside it, so the last "/" on the
// line before the caret is always the one that opened the menu. Uses
// Selection.modify to extend the selection backward character-by-character — so
// it works even when WebKit has split the typed fragment across text nodes — then
// execCommand("insertText") so the result flows through the same normalize path
// as ordinary typing. Returns false when no "/" fragment is found.
export function replaceSlashFragment(root: HTMLElement, name: string): boolean {
  return replaceSlashFragmentWith(root, `/${name} `);
}

// The same swap with arbitrary `text`: an lpm command's whole prompt, which may
// run over several lines (inserted as "\n" characters, like a mention's logs).
export function replaceSlashFragmentWith(root: HTMLElement, text: string): boolean {
  const line = lineBeforeCaret(root);
  if (line === null) return false;
  const slash = line.lastIndexOf("/");
  if (slash === -1) return false;
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed) return false;
  const fragLen = graphemeCount(line.slice(slash)); // "/" plus the typed fragment
  for (let i = 0; i < fragLen; i++)
    sel.modify("extend", "backward", "character");
  if (text.includes("\n")) insertPlainText(root, text);
  else document.execCommand("insertText", false, text);
  return true;
}

// Replace the "@<frag>" preceding the caret on the current line with "@<value> ",
// leaving the caret after the trailing space ready to keep typing. Mirrors
// replaceSlashFragment, but the "@" can sit mid-line (the fragment is everything
// from the last "@" to the caret) and <value> may hold path separators. Returns
// false when no "@" fragment is found.
export function replaceMentionFragment(
  root: HTMLElement,
  value: string,
): boolean {
  return replaceMentionFragmentWith(root, `@${value} `);
}

// Replace the bare `frag` (a command argument, no trigger char) preceding the
// caret with "<value> ", leaving the caret after the trailing space. The caller
// supplies the fragment it matched on the caret's line; an empty fragment just
// inserts. Same Selection.modify + insertText mechanics as the "/" and "@"
// variants, so WebKit-split text nodes and grapheme clusters are handled.
export function replaceArgFragment(
  root: HTMLElement,
  frag: string,
  value: string,
): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed) return false;
  const fragLen = graphemeCount(frag);
  for (let i = 0; i < fragLen; i++)
    sel.modify("extend", "backward", "character");
  document.execCommand("insertText", false, `${value} `);
  return true;
}

// Whether the caret is a collapsed selection parked inside the editor — false
// when the field was never focused, or a control elsewhere holds the selection.
export function caretInside(root: HTMLElement): boolean {
  const sel = window.getSelection();
  return (
    !!sel && sel.isCollapsed && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).startContainer)
  );
}

// Insert `text` at the caret, used by footer controls that have no typed
// fragment to replace. The caret moves to the field end first when it isn't
// already parked in the editor, so the insert can't land in some other element.
export function insertTextAtCaret(root: HTMLElement, text: string): boolean {
  if (!caretInside(root)) placeCaretAtEnd(root);
  return document.execCommand("insertText", false, text);
}

// `insertTextAtCaret` spaced off the word before it. The caret is parked first
// (the control can be clicked before the field was ever focused) so the padding
// is decided from where the text will actually land.
export function insertSpacedAtCaret(root: HTMLElement, text: string): boolean {
  root.focus();
  if (!caretInside(root)) placeCaretAtEnd(root);
  const line = lineBeforeCaret(root);
  const pad = line && !/\s$/.test(line) ? " " : "";
  return insertTextAtCaret(root, `${pad}${text}`);
}

// Replace the "@<frag>" preceding the caret with arbitrary `text` (no leading
// "@"), used when a mention expands to injected content — e.g. a service's
// captured logs — instead of a literal token the agent resolves. `text` may hold
// newlines, which go in as "\n" characters (WebKit's insertText would split them
// into <div> lines). Returns false when no "@" is found.
export function replaceMentionFragmentWith(
  root: HTMLElement,
  text: string,
): boolean {
  const line = lineBeforeCaret(root);
  if (line === null) return false;
  const at = line.lastIndexOf("@");
  if (at === -1) return false;
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed) return false;
  const fragLen = graphemeCount(line.slice(at)); // "@" plus the typed fragment
  for (let i = 0; i < fragLen; i++)
    sel.modify("extend", "backward", "character");
  if (text.includes("\n")) insertPlainText(root, text);
  else document.execCommand("insertText", false, text);
  return true;
}

// A leading command on the first line: optional indent, "/name" (a CLI slash
// command) or "$name" (Codex's skill-mention form), then a space or end — so a
// path like "/usr/bin" (slash inside) never matches. A caret anchor before a chip
// right after the command ends it too.
const COMMAND_TOKEN_RE = /^(\s*)([/$][a-z0-9:_-]+)(?=[\s\u200B]|$)/i;

function firstTextNode(root: HTMLElement): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

// The editor's leading run of plain text (text nodes + any current highlight
// span), stopping at the first chip or line break — what the command regex tests
// regardless of whether the command is currently wrapped.
function leadingPlainText(root: HTMLElement): string {
  let out = "";
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.dataset.img !== undefined || node.tagName === "BR") break;
    out += node.textContent ?? "";
    if (node.dataset.cmd === undefined) break;
  }
  return out;
}

function unwrapCmdSpans(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-cmd]").forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });
  root.normalize();
}

// The lpm-memory invocation in either CLI's form ("/" Claude, "$" Codex)
// followed by a session-id token — the id is wrapped as a pill when it names a
// known session (see highlightCommand).
const MEMORY_ARG_TOKEN_RE = /^\s*[/$]lpm-memory\s+([a-z0-9-]+)(?=[\s\u200B]|$)/i;

// Color a recognized leading "/command" in the composer the way the CLIs do. The
// command is wrapped in an inline span (serialized away by serializeEditor) only
// when `isCommand` recognizes it, so partial/unknown tokens stay plain. When the
// command is "/lpm-memory" and its first argument names a session in
// `memorySessionIds`, that token is additionally wrapped as a hoverable pill.
// Both wraps share the data-cmd family, so every serialization and caret path
// treats them as plain inline text. Idempotent and caret-preserving: when the
// wraps are already correct it does nothing, so steady typing of arguments never
// restructures the DOM.
export function highlightCommand(
  root: HTMLElement,
  isCommand: (name: string) => boolean,
  memorySessionIds?: ReadonlySet<string>,
): void {
  const leading = leadingPlainText(root);
  const match = COMMAND_TOKEN_RE.exec(leading);
  // "$" tokens are otherwise shell-looking text ($PATH, $HOME) — only the
  // lpm-memory skill mention earns the highlight.
  const want =
    match !== null &&
    (match[2][0] === "$"
      ? match[2].slice(1).toLowerCase() === "lpm-memory"
      : isCommand(match[2].slice(1)));
  const argMatch = want ? MEMORY_ARG_TOKEN_RE.exec(leading) : null;
  const pillId =
    argMatch && memorySessionIds?.has(argMatch[1].toLowerCase()) ? argMatch[1] : null;

  const spans = root.querySelectorAll<HTMLElement>("[data-cmd]");
  if (!want && spans.length === 0) return;
  const cmdOk =
    want && spans.length > 0 && spans[0].textContent === match![2] && spans[0].dataset.memchip === undefined;
  if (cmdOk && pillId === null && spans.length === 1) return;
  if (
    cmdOk &&
    pillId !== null &&
    spans.length === 2 &&
    spans[1].dataset.memchip === pillId &&
    spans[1].textContent === pillId
  ) {
    return;
  }

  const offset = caretOffsetInSerialized(root);
  unwrapCmdSpans(root);
  if (want) {
    const node = firstTextNode(root);
    const m = node ? COMMAND_TOKEN_RE.exec(node.nodeValue ?? "") : null;
    if (node && m) {
      const start = m[1].length;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + m[2].length);
      const span = document.createElement("span");
      span.dataset.cmd = "";
      span.style.color = COMMAND_COLOR;
      try {
        range.surroundContents(span);
      } catch {
        // A boundary we can't cleanly wrap — leave the text plain.
      }
      const after = span.isConnected ? span.nextSibling : null;
      if (pillId !== null && after?.nodeType === Node.TEXT_NODE) {
        const am = /^(\s+)([a-z0-9-]+)/i.exec((after as Text).nodeValue ?? "");
        if (am && am[2] === pillId) {
          const pillRange = document.createRange();
          pillRange.setStart(after, am[1].length);
          pillRange.setEnd(after, am[1].length + am[2].length);
          const pill = document.createElement("span");
          pill.dataset.cmd = "";
          pill.dataset.memchip = pillId;
          pill.className = "composer-memchip";
          try {
            pillRange.surroundContents(pill);
          } catch {
            // A boundary we can't cleanly wrap — leave the text plain.
          }
        }
      }
    }
  }
  if (offset !== null) setCaretAtOffset(root, offset);
}

// Seat a collapsed caret at the drop coordinates so a dropped image lands where
// the pointer is, not at a stale caret or the field end. Returns false (leaving
// the caller's end-of-field fallback) when the point misses the editor.
export function placeCaretFromPoint(
  root: HTMLElement,
  x: number,
  y: number,
): boolean {
  const range = document.caretRangeFromPoint(x, y);
  if (!range || !root.contains(range.startContainer)) return false;
  range.collapse(true);
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  canonicalizeSelection(root);
  return true;
}
