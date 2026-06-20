// DOM helpers for the contentEditable terminal composer. Image references are
// rendered as atomic, non-editable "chips" so a token can only be selected or
// removed as a whole — never split mid-text — and serialized back to the
// `[Image #N]` placeholders the rest of the app expects.

export const IMAGE_TOKEN_RE = /\[Image #(\d+)\]/g;

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

// WebKit can leave zero-length text nodes wedged against a chip after editing.
// Skip only those (never a visible whitespace separator, which the user must
// delete first) so chip lookup still finds the chip behind the residue.
function skipEmptyText(node: Node | null, dir: "prev" | "next"): Node | null {
  while (node && node.nodeType === Node.TEXT_NODE && (node.nodeValue ?? "").length === 0) {
    node = dir === "prev" ? node.previousSibling : node.nextSibling;
  }
  return node;
}

// The chip immediately before a (container, offset) position, skipping empty
// text residue. Shared by chipBeforeCaret and insertItemsAtCaret's separator.
function chipBeforePoint(container: Node, offset: number): HTMLElement | null {
  let node: Node | null;
  if (container.nodeType === Node.TEXT_NODE) {
    if (offset > 0) return null;
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
  return (root.textContent ?? "").length === 0 && !root.querySelector("[data-img]");
}

// Walk the editor and rebuild the plain-text value: text nodes verbatim, chips
// as `[Image #N]`, line breaks as "\n". WebKit parks a placeholder <br> at the
// end of the field for caret visibility — skip it so it doesn't add a phantom
// trailing newline.
export function serializeEditor(root: HTMLElement): string {
  let out = "";
  const visit = (parent: Node) => {
    const children = Array.from(parent.childNodes);
    children.forEach((node, idx) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue ?? "";
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
      // A block wrapper WebKit may introduce represents a new visual line.
      if (out.length && !out.endsWith("\n")) out += "\n";
      visit(node);
    });
  };
  visit(root);
  return out;
}

// Rebuild the editor from a plain-text value, turning any `[Image #N]` tokens
// back into chips (used when recalling history).
export function setEditorContent(root: HTMLElement, value: string): void {
  root.replaceChildren();
  if (!value) return;
  IMAGE_TOKEN_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = IMAGE_TOKEN_RE.exec(value))) {
    if (m.index > last) root.appendChild(document.createTextNode(value.slice(last, m.index)));
    root.appendChild(createImageChip(Number(m[1])));
    last = m.index + m[0].length;
  }
  if (last < value.length) root.appendChild(document.createTextNode(value.slice(last)));
}

export function presentImageTokens(root: HTMLElement): Set<number> {
  const present = new Set<number>();
  root.querySelectorAll<HTMLElement>("[data-img]").forEach((el) => {
    const n = Number(el.dataset.img);
    if (!Number.isNaN(n)) present.add(n);
  });
  return present;
}

// Insert chips and/or text at the caret (falling back to the end of the field
// when the selection is elsewhere, e.g. an OS drop). Items are space-separated;
// no trailing space is added, so a single Backspace right after a chip removes
// the whole chip instead of first eating a phantom space.
export function insertItemsAtCaret(root: HTMLElement, items: Array<HTMLElement | string>): void {
  if (items.length === 0) return;
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
    const after = document.createRange();
    after.setStartAfter(lastNode);
    after.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(after);
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

// Remove a chip and leave a collapsed caret where it was.
export function removeChip(chip: HTMLElement): void {
  const parent = chip.parentNode;
  if (!parent) return;
  const idx = Array.prototype.indexOf.call(parent.childNodes, chip);
  chip.remove();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStart(parent, Math.min(idx, parent.childNodes.length));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
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
    if (r.startOffset < (r.startContainer.nodeValue?.length ?? 0)) return null;
    node = skipEmptyText(r.startContainer.nextSibling, "next");
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
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
