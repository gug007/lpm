// DOM helpers for the contentEditable terminal composer. Image references are
// rendered as atomic, non-editable "chips" so a token can only be selected or
// removed as a whole — never split mid-text — and serialized back to the
// `[Image #N]` placeholders the rest of the app expects.

import { basename } from "../path";
import { ansiColors } from "./terminal-utils";
import type { ComposerClipboardPayload } from "./composerClipboard";

// The same blue the terminal renders a recognized slash command in (xterm's
// bright-blue), so the composer's highlight matches what the CLI shows.
export const COMMAND_COLOR = ansiColors.brightBlue;

const IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g;

// A single attachment: the `[Image #N]` token in the serialized text and the
// local file path it resolves to. The path is read in place by whoever consumes
// the value, so there's no separate upload step here (unlike the terminal).
export interface ComposerImage {
  token: number;
  path: string;
}

// The composer's serialized value: text with inline `[Image #N]` tokens, the
// token→path map for those tokens, and whether an image is still being saved
// (so the consumer can hold a submit until attachments are on disk).
export interface ComposerValue {
  text: string;
  images: ComposerImage[];
  pending: boolean;
}

export const EMPTY_COMPOSER: ComposerValue = {
  text: "",
  images: [],
  pending: false,
};

// Shared visual base for an image chip, so the editable composer chip and the
// read-only history chip (MessageImageChip) can't drift apart. Each site layers
// its own interaction classes (group/cursor/hover) on top.
export const IMAGE_CHIP_CLASS =
  "inline-flex select-none items-center gap-1.5 rounded-lg bg-[#38bdf8]/20 py-0.5 pl-0.5 pr-2 align-middle text-[12px] font-medium leading-4 text-[#38bdf8]";
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
// "×" overlay — click it to drop the image; click the label to open the lightbox.
const CHIP_CLASS = `group ${IMAGE_CHIP_CLASS} cursor-zoom-in transition-colors hover:bg-[#38bdf8]/30`;

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
const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|avi|m4v|flv|wmv|mpe?g)$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|aiff?)$/i;
// A path the composer renders as an image chip (thumbnail + lightbox); every
// other dropped/pasted file becomes a named file chip. Shared by the editor, the
// drop/paste handlers, and the read-only history chips so they stay in agreement.
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|svg)$/i;

export function isImagePath(path: string): boolean {
  return IMAGE_EXT_RE.test(path);
}

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
// "Image N" label. The `[Image #N]` token, the path map, and the remove/cut
// behavior are shared with image chips — only the resting look differs, so a
// dropped .txt/.mp4 still resolves to its path on send. Idempotent.
export function renderFileChip(chip: HTMLElement, path: string): void {
  if (chip.dataset.file === "1") return;
  chip.dataset.file = "1";
  chip.classList.remove("cursor-zoom-in");
  chip.classList.add("cursor-default");
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
  slot.insertBefore(img, slot.firstChild);
  slot.querySelector("[data-img-ph]")?.remove();
}

function isChip(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.img !== undefined;
}

// Invisible residue wedged against a chip: zero-length text nodes WebKit leaves
// after editing, plus the zero-width-space caret anchor we park after a trailing
// chip (see ensureTrailingCaretAnchor). Skip both so chip lookup finds the chip
// behind them — but never a visible whitespace separator, which stays.
function skipEmptyText(node: Node | null, dir: "prev" | "next"): Node | null {
  while (isStrayOnlyText(node)) {
    node = dir === "prev" ? node.previousSibling : node.nextSibling;
  }
  return node;
}

// The chip immediately before a (container, offset) position, skipping empty
// text residue. Shared by chipBeforeCaret and insertItemsAtCaret's separator.
function chipBeforePoint(container: Node, offset: number): HTMLElement | null {
  let node: Node | null;
  if (container.nodeType === Node.TEXT_NODE) {
    // Anything real before the caret means the chip isn't adjacent; a stray-only
    // prefix (the caret anchor parked after a chip) is residue to look past.
    if (!isStrayOnly((container.nodeValue ?? "").slice(0, offset))) return null;
    node = skipEmptyText(container.previousSibling, "prev");
  } else {
    node = skipEmptyText(container.childNodes[offset - 1] ?? null, "prev");
  }
  return isChip(node) ? node : null;
}

// True when the field shows nothing at all (drives the placeholder). Uses the
// live DOM rather than serialize() so a WebKit leftover empty block (e.g.
// `<div><br></div>` after clearing) still counts as empty.
export function isEditorEmpty(root: HTMLElement): boolean {
  return (
    isStrayOnly(root.textContent ?? "") && !root.querySelector("[data-img]")
  );
}

// Zero-width/format characters, the object-replacement char, and C0/C1 control
// codes (except tab and newline) that should never be part of composer text.
// WebKit can leave these behind when the caret navigates around a chip.
const STRAY_CHARS_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u2060\uFEFF\uFFFC]/g;

const STRAY_CHARS_TEST = new RegExp(STRAY_CHARS_RE.source);

const ZWSP = "\u200B";

// True when `str` holds no visible content — empty once stray/zero-width
// characters (WebKit's tofu residue and the caret-anchor ZWSP) are stripped.
function isStrayOnly(str: string): boolean {
  return str.replace(STRAY_CHARS_RE, "").length === 0;
}

// A text node holding nothing but stray/zero-width characters — invisible
// residue, including the caret anchor we park after a trailing chip.
function isStrayOnlyText(node: Node | null): node is Text {
  return (
    node != null &&
    node.nodeType === Node.TEXT_NODE &&
    isStrayOnly(node.nodeValue ?? "")
  );
}

// A WebKit filler <br>: invisible residue left after a chip when the text in
// front of it is deleted. Carries no value (serializeEditor treats a trailing
// <br> as padding) but blocks the caret from anchoring after the chip.
function isFillerBr(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.tagName === "BR";
}

// Strip stray characters from the live editor DOM (not just at serialize time),
// keeping the collapsed caret in place. WebKit injects these when the caret
// moves around a contenteditable=false chip; this removes the visible "tofu"
// boxes from the field itself. Returns true if anything changed.
export function normalizeStrayChars(root: HTMLElement): boolean {
  if (!STRAY_CHARS_TEST.test(root.textContent ?? "")) return false;
  const sel = window.getSelection();
  const anchorNode = sel && sel.rangeCount > 0 ? sel.anchorNode : null;
  const anchorOffset = sel ? sel.anchorOffset : 0;
  let newAnchorOffset = anchorOffset;
  let changed = false;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode())
    nodes.push(t as Text);

  for (const node of nodes) {
    const val = node.nodeValue ?? "";
    // Keep the caret anchor parked after a chip that ends its line block (a lone
    // ZWSP as the block's last node): stripping it would re-expose the WebKit
    // caret-paint bug and leave an empty residue node behind. serializeEditor
    // strips it anyway.
    if (
      val === ZWSP &&
      node === node.parentNode?.lastChild &&
      isChip(node.previousSibling)
    )
      continue;
    const cleaned = val.replace(STRAY_CHARS_RE, "");
    if (cleaned === val) continue;
    if (node === anchorNode) {
      // Pull the caret back by however many stray chars sat before it.
      newAnchorOffset = val
        .slice(0, anchorOffset)
        .replace(STRAY_CHARS_RE, "").length;
    }
    node.nodeValue = cleaned;
    changed = true;
  }

  if (changed && sel && anchorNode && root.contains(anchorNode)) {
    const max =
      anchorNode.nodeType === Node.TEXT_NODE
        ? (anchorNode.nodeValue?.length ?? 0)
        : anchorNode.childNodes.length;
    try {
      const range = document.createRange();
      range.setStart(anchorNode, Math.min(newAnchorOffset, max));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
  }
  return changed;
}

// Walk the editor and rebuild the plain-text value: text nodes verbatim (minus
// stray characters), chips as `[Image #N]`, line breaks as "\n". WebKit parks a
// placeholder <br> at the end of the field for caret visibility — skip it so it
// doesn't add a phantom trailing newline. Also serializes a selection fragment
// cloned out of the editor (selectionClipboardPayload).
export function serializeEditor(root: HTMLElement | DocumentFragment): string {
  let out = "";
  const visit = (parent: Node) => {
    const children = Array.from(parent.childNodes);
    children.forEach((node, idx) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += (node.nodeValue ?? "").replace(STRAY_CHARS_RE, "");
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset.img) {
        out += `[Image #${node.dataset.img}]`;
        return;
      }
      if (node.tagName === "BR") {
        const isTrailingPad = parent === root && idx === children.length - 1;
        if (!isTrailingPad) out += "\n";
        return;
      }
      // The slash-command highlight is an inline wrapper, not a block: emit its
      // text in place so the serialized value is identical to the unwrapped text.
      if (node.dataset.cmd !== undefined) {
        visit(node);
        return;
      }
      // A block wrapper WebKit may introduce represents a new visual line.
      if (out.length && !out.endsWith("\n")) out += "\n";
      visit(node);
    });
  };
  visit(root);
  return out;
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
}

export function presentImageTokens(root: HTMLElement): Set<number> {
  const present = new Set<number>();
  root.querySelectorAll<HTMLElement>("[data-img]").forEach((el) => {
    const n = Number(el.dataset.img);
    if (!Number.isNaN(n)) present.add(n);
  });
  return present;
}

// WebKit mispaints a caret placed immediately after a contenteditable=false chip
// that ends its line block (it strands it at the line start, before the image).
// Parking the caret inside a zero-width-space text node after the chip gives it a
// real inline text position WebKit paints correctly. serializeEditor strips the
// ZWSP and chip lookups treat it as residue, so it never affects value or
// Backspace. `block` is the field itself for a first-line chip, or the wrapped
// <div> for a later line. Returns the anchor node, or null when the block's last
// node isn't a chip.
function ensureTrailingCaretAnchor(block: HTMLElement): Text | null {
  // Deleting the last text in front of a trailing chip can leave WebKit's bogus
  // filler <br> after it ([chip]<br>); drop it so the chip is the real last node.
  const tail = block.lastChild;
  if (isFillerBr(tail) && isChip(tail.previousSibling)) {
    tail.remove();
  }
  const last = block.lastChild;
  if (isStrayOnlyText(last) && isChip(last.previousSibling)) {
    last.nodeValue = ZWSP;
    return last;
  }
  if (!isChip(block.lastChild)) return null;
  const anchor = document.createTextNode(ZWSP);
  block.appendChild(anchor);
  return anchor;
}

// Whether the chip ends its own line — only a WebKit filler <br> or stray/anchor
// residue follows it within its block. This is the caret-after-chip position
// WebKit mispaints (stranding the caret at the line start, before the image), so
// it needs the ZWSP anchor (placeCaretAfterChip).
function isLineEndChip(node: Node): boolean {
  for (let n = node.nextSibling; n; n = n.nextSibling) {
    if (!isStrayOnlyText(n) && !isFillerBr(n)) return false;
  }
  return true;
}

// Seat the caret immediately after a chip, within the chip's own line block (the
// whole field for a first-line chip, or the wrapped <div> WebKit creates for a
// later line). A chip that ends its line triggers WebKit's caret mispaint, so
// park a ZWSP after it (ensureTrailingCaretAnchor) and seat the caret in that
// anchor — a real text position WebKit paints correctly. Falls back to
// setStartAfter if the chip somehow isn't its block's last node.
function placeCaretAfterChip(root: HTMLElement, chip: HTMLElement): void {
  const block =
    chip.parentElement && chip.parentElement !== root
      ? chip.parentElement
      : root;
  const anchor = ensureTrailingCaretAnchor(block);
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (anchor) range.setStart(anchor, anchor.nodeValue?.length ?? 0);
  else range.setStartAfter(chip);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// Insert chips and/or text at the caret (falling back to the end of the field
// when the selection is elsewhere, e.g. an OS drop). Items are space-separated;
// no trailing space is added, so a single Backspace right after a chip removes
// the whole chip instead of first eating a phantom space. Paste reconstruction
// passes `separate: false` to keep its segment runs verbatim — except two
// adjacent chips still get a separating space, so their tokens never serialize
// touching (whose resolved paths would concatenate on send).
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

  // If we're dropping a chip right after an existing chip, separate them so they
  // don't serialize as touching [Image #N][Image #M] (whose resolved file paths
  // would concatenate on send). Plain text adjacent to a chip is left untouched.
  const firstIsChip =
    items[0] instanceof HTMLElement && items[0].dataset.img !== undefined;
  const needsLeadingSpace =
    firstIsChip &&
    chipBeforePoint(range.startContainer, range.startOffset) !== null;

  const frag = document.createDocumentFragment();
  let lastNode: Node | null = null;
  if (needsLeadingSpace) frag.appendChild(document.createTextNode(" "));
  let prevWasChip = false;
  items.forEach((item, i) => {
    const itemIsChip =
      typeof item !== "string" && item.dataset.img !== undefined;
    if (i > 0 && (separate || (prevWasChip && itemIsChip)))
      frag.appendChild(document.createTextNode(" "));
    lastNode = typeof item === "string" ? document.createTextNode(item) : item;
    frag.appendChild(lastNode);
    prevWasChip = itemIsChip;
  });
  range.insertNode(frag);

  if (lastNode) {
    const tail = lastNode;
    const placeCaret = () => {
      if (!root.contains(tail)) return;
      // Don't pull focus back to a field the user has since left (a late async
      // image save); callers that own the drop focus it before inserting.
      if (!hadFocus && !focused()) return;
      // Focus first: after an unfocused OS drop WebKit ignores a programmatic
      // selection until the field is focused.
      root.focus();
      // A chip that ends its line needs the ZWSP anchor so the caret paints
      // after the image instead of stranding at the line start (the bug when an
      // image is dropped onto its own line); other runs take the caret right
      // after the inserted content.
      if (isChip(tail) && isLineEndChip(tail)) {
        placeCaretAfterChip(root, tail);
        return;
      }
      const after = document.createRange();
      after.setStartAfter(tail);
      after.collapse(true);
      const live = window.getSelection();
      live?.removeAllRanges();
      live?.addRange(after);
    };
    placeCaret();
    // The drop focuses the field late; re-applying once layout settles makes the
    // painted caret match the (already correct) selection.
    if (hadFocus) requestAnimationFrame(placeCaret);
  }
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
    else if (!isStrayOnlyText(node)) return null;
  }
  if (chips !== 1) return null;
  const n = frag.querySelector<HTMLElement>("[data-img]")?.dataset.img;
  return n != null
    ? root.querySelector<HTMLElement>(`[data-img="${n}"]`)
    : null;
}

// Remove a chip and leave a collapsed caret where it was.
export function removeChip(chip: HTMLElement): void {
  const parent = chip.parentNode;
  if (!parent) return;
  const idx = Array.prototype.indexOf.call(parent.childNodes, chip);
  // A trailing ZWSP caret anchor that exists only for this chip is now orphaned;
  // drop it so an empty field reads as empty (placeholder) and leaves no residue.
  const orphanAnchor =
    isStrayOnlyText(chip.nextSibling) &&
    chip.nextSibling === parent.lastChild &&
    !isChip(chip.previousSibling)
      ? chip.nextSibling
      : null;
  chip.remove();
  orphanAnchor?.remove();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStart(parent, Math.min(idx, parent.childNodes.length));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  // Programmatic removal fires no input event, so re-anchor here too: deleting
  // the last text/chip in front of another trailing chip would otherwise strand
  // the caret before it (the WebKit mispaint). No-ops unless a chip is trailing.
  if (parent instanceof HTMLElement) restoreTrailingChipCaret(parent);
}

// The chip immediately before a collapsed caret, if any (for Backspace).
export function chipBeforeCaret(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer)) return null;
  return chipBeforePoint(r.startContainer, r.startOffset);
}

// The chip immediately after a collapsed caret, if any (for Delete).
export function chipAfterCaret(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer)) return null;
  let node: Node | null;
  if (r.startContainer.nodeType === Node.TEXT_NODE) {
    const text = r.startContainer.nodeValue ?? "";
    // Caret parked in the trailing stray anchor after a chip: nothing real lies
    // ahead, so forward-Delete targets the chip behind the anchor — symmetric
    // with Backspace, which chipBeforeCaret already resolves from this spot.
    if (
      isStrayOnly(text.slice(r.startOffset)) &&
      skipEmptyText(r.startContainer.nextSibling, "next") === null
    ) {
      node = isStrayOnly(text.slice(0, r.startOffset))
        ? skipEmptyText(r.startContainer.previousSibling, "prev")
        : null;
    } else if (r.startOffset < text.length) {
      return null;
    } else {
      node = skipEmptyText(r.startContainer.nextSibling, "next");
    }
  } else {
    node = skipEmptyText(
      r.startContainer.childNodes[r.startOffset] ?? null,
      "next",
    );
  }
  return isChip(node) ? node : null;
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
  const isEmptyRange = (configure: (r: Range) => void) => {
    const r = document.createRange();
    r.selectNodeContents(root);
    configure(r);
    const frag = r.cloneContents();
    return (
      (frag.textContent ?? "").length === 0 && !frag.querySelector("[data-img]")
    );
  };
  return {
    collapsed: sel.isCollapsed,
    atStart: isEmptyRange((r) =>
      r.setEnd(range.startContainer, range.startOffset),
    ),
    atEnd: isEmptyRange((r) => r.setStart(range.endContainer, range.endOffset)),
  };
}

export function placeCaretAtEnd(root: HTMLElement): void {
  const anchor = ensureTrailingCaretAnchor(root);
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (anchor) {
    range.setStart(anchor, anchor.nodeValue?.length ?? 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

// True when the field holds visible text outside any chip. Lets a caret that
// legitimately sits before a trailing chip (real text precedes it) be told apart
// from a chips-only field, where the caret can only belong after the chip.
function hasTextOutsideChips(root: HTMLElement): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if ((t as Text).parentElement?.closest("[data-img]")) continue;
    if (!isStrayOnly(t.nodeValue ?? "")) return true;
  }
  return false;
}

// After an edit deletes the text in front of a trailing chip, WebKit strands the
// caret before the chip — the same mispaint ensureTrailingCaretAnchor hides,
// re-exposed because the ZWSP anchor was deleted along with the text. Re-anchor
// (restoring the ZWSP) when the caret belongs after the trailing chip: either it
// already sits at the end, or the field is chips-only so there is nothing else
// it could edit (WebKit moves the real caret to the field start here, not just
// the paint). Editing text *before* a trailing chip is left untouched. Returns
// true if it re-anchored.
export function restoreTrailingChipCaret(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false;
  if (!root.contains(sel.getRangeAt(0).startContainer)) return false;
  let last: Node | null = root.lastChild;
  while (last && (isStrayOnlyText(last) || isFillerBr(last))) {
    last = last.previousSibling;
  }
  if (!isChip(last)) return false;
  if (!caretEdges(root).atEnd && hasTextOutsideChips(root)) return false;
  placeCaretAtEnd(root);
  return true;
}

// Post-mutation caret hygiene in one call: strip WebKit's stray characters and
// re-anchor the caret after a trailing chip. Returns whether either moved the
// DOM/selection, so callers persist the draft only when something changed.
export function normalizeComposer(root: HTMLElement): boolean {
  const normalized = normalizeStrayChars(root);
  const reanchored = restoreTrailingChipCaret(root);
  return normalized || reanchored;
}

// Raw text from the field start to a collapsed caret — chip labels and the ZWSP
// caret anchors included — or null when the selection isn't a collapsed caret
// inside the field. Backs caretCharOffset, whose length must pair 1:1 with the raw
// DOM characters placeCaretAtCharOffset walks, so this deliberately keeps the
// residue lineBeforeCaret strips.
function caretPrefixText(root: HTMLElement): string | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.endContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(r.endContainer, r.endOffset);
  return pre.toString();
}

// A chip's stand-in on a computed line: one object-replacement char — a non-space
// boundary that lets an "@" typed right after a chip trigger the mention menu (see
// MENTION_TRIGGER) yet still suppress the start-anchored slash menu, without
// dragging in the chip's "Image N" label. It's in STRAY_CHARS_RE, so real typed
// text can never contain one, and lineBeforeCaret adds it directly (not via a text
// node), so the strip that clears residue leaves it intact.
const LINE_CHIP_PLACEHOLDER = "￼";

// Walk the DOM in document order with serializeEditor's rules but stop at a
// collapsed caret, returning the serialized prefix up to it — or null unless the
// selection is a collapsed caret inside the field. `chipText` supplies each
// chip's stand-in, the one axis on which callers differ: lineBeforeCaret wants a
// single LINE_CHIP_PLACEHOLDER (so triggers see a boundary, not the "Image N"
// label), while caretOffsetInSerialized wants the real "[Image #N]" token so the
// offset matches serializeEditor's output. Text nodes contribute their value
// minus stray residue, <br> and block wrappers become "\n", data-cmd spans are
// descended inline.
//
// This can't lean on caretPrefixText's Range.toString(): that string (1) folds in
// a chip's inner "Image N" label and the invisible ZWSP anchor parked after a
// chip, and (2) emits no "\n" for a <br> or a block-wrapper boundary — so for
// [chip]<br>"@" it collapses to the single line "Image 1​@", where neither the
// mention nor the slash trigger fires.
function serializedPrefixToCaret(
  root: HTMLElement,
  chipText: (n: string) => string,
): string | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  const caretNode = r.endContainer;
  const caretOffset = r.endOffset;
  if (!root.contains(caretNode)) return null;

  let out = "";
  let done = false;
  const visit = (parent: Node) => {
    const children = Array.from(parent.childNodes);
    for (let idx = 0; idx < children.length; idx++) {
      // Caret in an element container sits before child `caretOffset`: emit the
      // children ahead of it, then stop.
      if (parent === caretNode && idx >= caretOffset) {
        done = true;
        return;
      }
      const node = children[idx];
      if (node === caretNode && caretNode.nodeType === Node.TEXT_NODE) {
        out += (caretNode.nodeValue ?? "")
          .slice(0, caretOffset)
          .replace(STRAY_CHARS_RE, "");
        done = true;
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        out += (node.nodeValue ?? "").replace(STRAY_CHARS_RE, "");
        continue;
      }
      if (!(node instanceof HTMLElement)) continue;
      if (node.dataset.img) {
        out += chipText(node.dataset.img);
        continue;
      }
      if (node.tagName === "BR") {
        const isTrailingPad = parent === root && idx === children.length - 1;
        if (!isTrailingPad) out += "\n";
        continue;
      }
      if (node.dataset.cmd !== undefined) {
        visit(node);
        if (done) return;
        continue;
      }
      if (out.length && !out.endsWith("\n")) out += "\n";
      visit(node);
      if (done) return;
    }
    // Caret at the very end of this element container (offset === child count):
    // the loop exhausts without hitting the idx guard, but nothing after this
    // parent precedes the caret either.
    if (parent === caretNode) done = true;
  };
  visit(root);

  return out;
}

// The caret's line — from the last break up to a collapsed caret — which the
// slash- and mention-triggers inspect. Null unless the selection is a collapsed
// caret inside the field. Each chip counts as one LINE_CHIP_PLACEHOLDER; the line
// is what follows the last "\n".
export function lineBeforeCaret(root: HTMLElement): string | null {
  const out = serializedPrefixToCaret(root, () => LINE_CHIP_PLACEHOLDER);
  return out === null ? null : out.slice(out.lastIndexOf("\n") + 1);
}

// The caret's position as an offset into the value serializeEditor would produce
// — the offset space the composer's undo snapshots store. Unlike caretCharOffset
// (raw Range.toString() length: chip labels + ZWSP anchors, no "\n"), each chip
// counts as its full "[Image #N]" token and each break as one "\n", so the offset
// pairs 1:1 with the serialized text and survives the rebuild that restores it.
export function caretOffsetInSerialized(root: HTMLElement): number | null {
  const out = serializedPrefixToCaret(root, (n) => `[Image #${n}]`);
  return out === null ? null : out.length;
}

// Seat the caret at a serialized-text offset (caretOffsetInSerialized's inverse)
// over a DOM rebuilt from that text — text nodes carrying literal "\n" runs and
// atomic image chips, as applyHistoryEntry produces. An offset that lands inside a
// chip's "[Image #N]" token seats the caret immediately after the chip (a
// non-editable atom has no interior position). Falls back to the field end when
// the offset runs past the content.
export function placeCaretAtSerializedOffset(
  root: HTMLElement,
  offset: number,
): void {
  let acc = 0;
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.nodeValue ?? "").length;
      if (acc + len >= offset) {
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.setStart(node, Math.max(0, Math.min(len, offset - acc)));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      acc += len;
      continue;
    }
    if (isChip(node)) {
      const tokenLen = `[Image #${node.dataset.img}]`.length;
      if (acc + tokenLen >= offset) {
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        if (offset <= acc) range.setStartBefore(node);
        else range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      acc += tokenLen;
    }
  }
  placeCaretAtEnd(root);
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
// leaving the caret after the trailing space ready for arguments. Uses
// Selection.modify to extend the selection backward character-by-character — so
// it works even when WebKit has split the typed fragment across text nodes — then
// execCommand("insertText") so the result flows through the same normalize path
// as ordinary typing. Returns false when no "/" fragment is found.
export function replaceSlashFragment(root: HTMLElement, name: string): boolean {
  const line = lineBeforeCaret(root);
  if (line === null) return false;
  const slash = line.lastIndexOf("/");
  if (slash === -1) return false;
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed) return false;
  const fragLen = line.length - slash; // "/" plus the typed fragment
  for (let i = 0; i < fragLen; i++)
    sel.modify("extend", "backward", "character");
  document.execCommand("insertText", false, `/${name} `);
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

// Replace the "@<frag>" preceding the caret with arbitrary `text` (no leading
// "@"), used when a mention expands to injected content — e.g. a service's
// captured logs — instead of a literal token the agent resolves. `text` may hold
// newlines; execCommand inserts them as the same break structure ordinary typing
// would, so serializeEditor round-trips it. Returns false when no "@" is found.
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
  const fragLen = line.length - at; // "@" plus the typed fragment
  for (let i = 0; i < fragLen; i++)
    sel.modify("extend", "backward", "character");
  document.execCommand("insertText", false, text);
  return true;
}

// A leading slash command on the first line: optional indent, "/name", then a
// space or end — so a path like "/usr/bin" (slash inside) never matches.
const COMMAND_TOKEN_RE = /^(\s*)(\/[a-z0-9:_-]+)(?=\s|$)/i;

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

// Caret position as a count of visible characters from the field start, stable
// across the unwrap/rewrap below since that only re-nests text, never edits it.
export function caretCharOffset(root: HTMLElement): number | null {
  const text = caretPrefixText(root);
  return text === null ? null : text.length;
}

export function placeCaretAtCharOffset(
  root: HTMLElement,
  offset: number,
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = (n.nodeValue ?? "").length;
    if (acc + len >= offset) {
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.setStart(n, Math.max(0, Math.min(len, offset - acc)));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    acc += len;
  }
  placeCaretAtEnd(root);
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

// Color a recognized leading "/command" in the composer the way the CLIs do. The
// command is wrapped in an inline span (serialized away by serializeEditor) only
// when `isCommand` recognizes it, so partial/unknown tokens stay plain. Idempotent
// and caret-preserving: when the wrap is already correct it does nothing, so steady
// typing of arguments never restructures the DOM.
export function highlightCommand(
  root: HTMLElement,
  isCommand: (name: string) => boolean,
): void {
  const match = COMMAND_TOKEN_RE.exec(leadingPlainText(root));
  const want = match !== null && isCommand(match[2].slice(1));
  const spans = root.querySelectorAll<HTMLElement>("[data-cmd]");
  if (want && spans.length === 1 && spans[0].textContent === match![2]) return;
  if (!want && spans.length === 0) return;

  const offset = caretCharOffset(root);
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
    }
  }
  if (offset !== null) placeCaretAtCharOffset(root, offset);
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
  return true;
}
