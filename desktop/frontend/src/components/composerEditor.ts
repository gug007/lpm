// DOM helpers for the contentEditable terminal composer. Image references are
// rendered as atomic, non-editable "chips" so a token can only be selected or
// removed as a whole — never split mid-text — and serialized back to the
// `[Image #N]` placeholders the rest of the app expects.

import { ansiColors } from "./terminal-utils";

// The same blue the terminal renders a recognized slash command in (xterm's
// bright-blue), so the composer's highlight matches what the CLI shows.
export const COMMAND_COLOR = ansiColors.brightBlue;

const IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g;

const CHIP_CLASS =
  "group inline-flex select-none items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-active)] py-0.5 pl-1 pr-1.5 align-middle text-[12px] leading-4 text-[var(--text-secondary)]";

const SVG_OPEN =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

// The leading icon doubles as the remove button: it shows an image glyph by
// default and a "×" while the chip is hovered, so a single click drops the image.
const IMAGE_ICON = `${SVG_OPEN} stroke-width="1.6" class="block group-hover:hidden"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-5-5L7 21"/></svg>`;
const REMOVE_ICON = `${SVG_OPEN} stroke-width="2" class="hidden group-hover:block"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

export function createImageChip(n: number): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.dataset.img = String(n);
  chip.contentEditable = "false";
  chip.className = CHIP_CLASS;
  chip.innerHTML =
    `<span data-img-remove="${n}" role="button" aria-label="Remove image" title="Remove image" class="flex h-4 w-4 cursor-pointer items-center justify-center rounded hover:text-[var(--accent-red)]">${IMAGE_ICON}${REMOVE_ICON}</span>` +
    `<span class="cursor-default">Image ${n}</span>`;
  return chip;
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
  return isStrayOnly(root.textContent ?? "") && !root.querySelector("[data-img]");
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
    node != null && node.nodeType === Node.TEXT_NODE && isStrayOnly(node.nodeValue ?? "")
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
  for (let t = walker.nextNode(); t; t = walker.nextNode()) nodes.push(t as Text);

  for (const node of nodes) {
    const val = node.nodeValue ?? "";
    // Keep the caret anchor parked after a trailing chip (a lone ZWSP as the
    // last node): stripping it would re-expose the WebKit caret-paint bug and
    // leave an empty residue node behind. serializeEditor strips it anyway.
    if (node === root.lastChild && val === ZWSP && isChip(node.previousSibling)) continue;
    const cleaned = val.replace(STRAY_CHARS_RE, "");
    if (cleaned === val) continue;
    if (node === anchorNode) {
      // Pull the caret back by however many stray chars sat before it.
      newAnchorOffset = val.slice(0, anchorOffset).replace(STRAY_CHARS_RE, "").length;
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
// doesn't add a phantom trailing newline.
export function serializeEditor(root: HTMLElement): string {
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
    if (m.index > last) segments.push({ text: value.slice(last, m.index), image: null });
    segments.push({ text: m[0], image: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < value.length) segments.push({ text: value.slice(last), image: null });
  return segments;
}

// Rebuild the editor from a plain-text value, turning any `[Image #N]` tokens
// back into chips (used when recalling history).
export function setEditorContent(root: HTMLElement, value: string): void {
  root.replaceChildren();
  if (!value) return;
  for (const seg of splitByImageTokens(value)) {
    root.appendChild(seg.image === null ? document.createTextNode(seg.text) : createImageChip(seg.image));
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

// WebKit mispaints a caret placed immediately after a trailing
// contenteditable=false chip (it parks it at the field start, before the image).
// Parking the caret inside a zero-width-space text node after the chip gives it a
// real inline text position WebKit paints correctly. serializeEditor strips the
// ZWSP and chip lookups treat it as residue, so it never affects value or
// Backspace. Returns the anchor node, or null when the last node isn't a chip.
function ensureTrailingCaretAnchor(root: HTMLElement): Text | null {
  // Deleting the last text in front of a trailing chip can leave WebKit's bogus
  // filler <br> after it ([chip]<br>); drop it so the chip is the real last node.
  const tail = root.lastChild;
  if (isFillerBr(tail) && isChip(tail.previousSibling)) {
    tail.remove();
  }
  const last = root.lastChild;
  if (isStrayOnlyText(last) && isChip(last.previousSibling)) {
    last.nodeValue = ZWSP;
    return last;
  }
  if (!isChip(root.lastChild)) return null;
  const anchor = document.createTextNode(ZWSP);
  root.appendChild(anchor);
  return anchor;
}

// Whether `node` is the last meaningful child — only stray/anchor residue (if
// anything) follows it.
function isTrailing(root: HTMLElement, node: Node): boolean {
  if (!root.contains(node)) return false;
  for (let n = node.nextSibling; n; n = n.nextSibling) {
    if (!isStrayOnlyText(n)) return false;
  }
  return true;
}

// Insert chips and/or text at the caret (falling back to the end of the field
// when the selection is elsewhere, e.g. an OS drop). Items are space-separated;
// no trailing space is added, so a single Backspace right after a chip removes
// the whole chip instead of first eating a phantom space.
export function insertItemsAtCaret(root: HTMLElement, items: Array<HTMLElement | string>): void {
  if (items.length === 0) return;
  // Whether the field owns focus. A paste/drop whose image save resolved after
  // the user moved focus away must not yank it back.
  const focused = () => root === document.activeElement || root.contains(document.activeElement);
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
  const firstIsChip = items[0] instanceof HTMLElement && items[0].dataset.img !== undefined;
  const needsLeadingSpace =
    firstIsChip && chipBeforePoint(range.startContainer, range.startOffset) !== null;

  const frag = document.createDocumentFragment();
  let lastNode: Node | null = null;
  if (needsLeadingSpace) frag.appendChild(document.createTextNode(" "));
  items.forEach((item, i) => {
    if (i > 0) frag.appendChild(document.createTextNode(" "));
    lastNode = typeof item === "string" ? document.createTextNode(item) : item;
    frag.appendChild(lastNode);
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
      // A trailing chip needs the ZWSP anchor (placeCaretAtEnd) so the caret
      // paints after the image; otherwise drop it right after the inserted run.
      if (isChip(tail) && isTrailing(root, tail)) {
        placeCaretAtEnd(root);
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
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const frag = range.cloneContents();
  let chips = 0;
  for (const node of Array.from(frag.childNodes)) {
    if (isChip(node)) chips += 1;
    else if (!isStrayOnlyText(node)) return null;
  }
  if (chips !== 1) return null;
  const n = frag.querySelector<HTMLElement>("[data-img]")?.dataset.img;
  return n != null ? root.querySelector<HTMLElement>(`[data-img="${n}"]`) : null;
}

// Remove a chip and leave a collapsed caret where it was.
export function removeChip(chip: HTMLElement): void {
  const parent = chip.parentNode;
  if (!parent) return;
  const idx = Array.prototype.indexOf.call(parent.childNodes, chip);
  // A trailing ZWSP caret anchor that exists only for this chip is now orphaned;
  // drop it so an empty field reads as empty (placeholder) and leaves no residue.
  const orphanAnchor =
    isStrayOnlyText(chip.nextSibling) && chip.nextSibling === parent.lastChild && !isChip(chip.previousSibling)
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
    if (isStrayOnly(text.slice(r.startOffset)) && skipEmptyText(r.startContainer.nextSibling, "next") === null) {
      node = isStrayOnly(text.slice(0, r.startOffset))
        ? skipEmptyText(r.startContainer.previousSibling, "prev")
        : null;
    } else if (r.startOffset < text.length) {
      return null;
    } else {
      node = skipEmptyText(r.startContainer.nextSibling, "next");
    }
  } else {
    node = skipEmptyText(r.startContainer.childNodes[r.startOffset] ?? null, "next");
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
  if (!sel || sel.rangeCount === 0) return { collapsed: false, atStart: false, atEnd: false };
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return { collapsed: false, atStart: false, atEnd: false };
  }
  const isEmptyRange = (configure: (r: Range) => void) => {
    const r = document.createRange();
    r.selectNodeContents(root);
    configure(r);
    const frag = r.cloneContents();
    return (frag.textContent ?? "").length === 0 && !frag.querySelector("[data-img]");
  };
  return {
    collapsed: sel.isCollapsed,
    atStart: isEmptyRange((r) => r.setEnd(range.startContainer, range.startOffset)),
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

// The text of the current line from its start up to a collapsed caret — what a
// "/" slash-command trigger inspects. Returns null when the selection isn't a
// collapsed caret inside the field. Chips on the line contribute their visible
// label text, which is fine: the slash trigger only fires on a line that is
// purely "/<frag>", so a chip's presence simply suppresses it.
// Visible text from the field start to a collapsed caret, or null when the
// selection isn't a collapsed caret inside the field. Shared by lineBeforeCaret
// (slices the current line) and caretCharOffset (takes its length).
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

export function lineBeforeCaret(root: HTMLElement): string | null {
  const text = caretPrefixText(root);
  return text === null ? null : text.slice(text.lastIndexOf("\n") + 1);
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
  for (let i = 0; i < fragLen; i++) sel.modify("extend", "backward", "character");
  document.execCommand("insertText", false, `/${name} `);
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
function caretCharOffset(root: HTMLElement): number | null {
  const text = caretPrefixText(root);
  return text === null ? null : text.length;
}

function placeCaretAtCharOffset(root: HTMLElement, offset: number): void {
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
export function highlightCommand(root: HTMLElement, isCommand: (name: string) => boolean): void {
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
export function placeCaretFromPoint(root: HTMLElement, x: number, y: number): boolean {
  const range = document.caretRangeFromPoint(x, y);
  if (!range || !root.contains(range.startContainer)) return false;
  range.collapse(true);
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}
