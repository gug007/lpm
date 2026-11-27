// Low-level pieces shared by the composer's editing modules: what counts as an
// attachment chip or a command highlight, the invisible residue characters, and
// the rules that turn the editor's DOM into its serialized "[Image #N]" value.

export const ZWSP = "​";

// Zero-width/format characters, the object-replacement char, and C0/C1 control
// codes (except tab and newline) that should never be part of composer text.
// The editor parks ZWSP caret anchors beside chips; WebKit leaves the rest
// behind when the caret navigates around one.
export const STRAY_CHARS_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​⁠﻿￼]/g;

const STRAY_CHAR_TEST = new RegExp(`^${STRAY_CHARS_RE.source}$`);

export function isStrayChar(ch: string): boolean {
  return STRAY_CHAR_TEST.test(ch);
}

export function stripStray(str: string): string {
  return str.replace(STRAY_CHARS_RE, "");
}

// True when `str` holds no visible content.
export function isStrayOnly(str: string): boolean {
  return stripStray(str).length === 0;
}

export function isChip(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.img !== undefined;
}

// The inline wrapper highlightCommand puts around a leading "/command" (and the
// memory session pill). It holds plain text and serializes as that text.
export function isCmdSpan(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement && node.dataset.cmd !== undefined;
}

// A project chip stands for its own "@path" text, so the value still carries
// exactly what is sent; an attachment chip stands for its "[Image #N]" token.
export function chipToken(chip: HTMLElement): string {
  return chip.dataset.mention ?? `[Image #${chip.dataset.img}]`;
}

export type ComposerPart = { text: string } | { chip: HTMLElement };

// The editor's content as ordered text runs and chips, under serializeEditor's
// rules: stray characters dropped, a <br> is a line break unless it is the
// field's trailing placeholder, and a block wrapper WebKit introduces starts a
// new line. Chips are the live elements, so a rebuild can reuse them (and the
// thumbnails they already loaded).
export function readParts(root: Node): ComposerPart[] {
  const parts: ComposerPart[] = [];
  let text = "";
  const flush = () => {
    if (text) parts.push({ text });
    text = "";
  };
  const endsWithBreak = () => {
    if (text) return text.endsWith("\n");
    const last = parts[parts.length - 1];
    return !last || ("text" in last && last.text.endsWith("\n"));
  };
  const visit = (parent: Node) => {
    const children = Array.from(parent.childNodes);
    children.forEach((node, idx) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += stripStray(node.nodeValue ?? "");
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset.img !== undefined) {
        flush();
        parts.push({ chip: node });
        return;
      }
      if (node.tagName === "BR") {
        const isTrailingPad = parent === root && idx === children.length - 1;
        if (!isTrailingPad) text += "\n";
        return;
      }
      if (node.dataset.cmd !== undefined) {
        visit(node);
        return;
      }
      if (parts.length + text.length > 0 && !endsWithBreak()) text += "\n";
      visit(node);
    });
  };
  visit(root);
  flush();
  return parts;
}

export function partsToText(parts: ComposerPart[]): string {
  return parts.map((p) => ("chip" in p ? chipToken(p.chip) : p.text)).join("");
}

// The serialized prefix of the editor up to the DOM point (node, offset), under
// readParts' rules. `chipText` supplies each chip's stand-in: its "[Image #N]"
// token for offsets in the value's space, or a single placeholder character for
// the slash/mention triggers. A point inside a chip counts as after it.
export function serializedPrefix(
  root: HTMLElement,
  node: Node,
  offset: number,
  chipText: (chip: HTMLElement) => string,
): string {
  let out = "";
  let done = false;
  const visit = (parent: Node) => {
    const children = Array.from(parent.childNodes);
    for (let idx = 0; idx < children.length; idx++) {
      if (parent === node && idx >= offset) {
        done = true;
        return;
      }
      const child = children[idx];
      if (child.nodeType === Node.TEXT_NODE) {
        const value = child.nodeValue ?? "";
        if (child === node) {
          out += stripStray(value.slice(0, offset));
          done = true;
          return;
        }
        out += stripStray(value);
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      if (child.dataset.img !== undefined) {
        if (child === node && offset === 0) {
          done = true;
          return;
        }
        out += chipText(child);
        if (child === node || child.contains(node)) {
          done = true;
          return;
        }
        continue;
      }
      if (child.tagName === "BR") {
        const isTrailingPad = parent === root && idx === children.length - 1;
        if (!isTrailingPad) out += "\n";
        continue;
      }
      if (child.dataset.cmd !== undefined) {
        visit(child);
        if (done) return;
        continue;
      }
      if (out.length && !out.endsWith("\n")) out += "\n";
      visit(child);
      if (done) return;
    }
    if (parent === node) done = true;
  };
  visit(root);
  return out;
}

// A DOM point's offset into the serialized value.
export function pointOffset(root: HTMLElement, node: Node, offset: number): number {
  return serializedPrefix(root, node, offset, chipToken).length;
}

// Tell the field it was edited, so its input handling (undo, value sync,
// menus) runs for a change made through the DOM rather than by WebKit.
export function notifyEdit(root: HTMLElement, inputType: string): void {
  root.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
}
