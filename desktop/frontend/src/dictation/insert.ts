// Where a dictation's transcript lands: the field that had focus when it
// started, at the caret it had then. Captured up front because the recorder's
// buttons, and the wait for the transcript, can both move focus away.

type TextField = HTMLTextAreaElement | HTMLInputElement;

export interface DictationTarget {
  element: HTMLElement;
  // The caret of a text field, or a live Range in a contenteditable editor
  // (a Range follows edits made while recording; offsets don't need to).
  caret: { start: number; end: number } | Range | null;
}

// Fired on a field once a transcript has been typed into it.
export const DICTATION_DELIVERED = "lpm-dictation-delivered";

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", ""]);

function isTextField(el: Element): el is TextField {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  }
  return false;
}

export function captureDictationTarget(
  el: Element | null = document.activeElement,
): DictationTarget | null {
  if (!(el instanceof HTMLElement)) return null;
  if (isTextField(el)) {
    const end = el.value.length;
    return { element: el, caret: { start: el.selectionStart ?? end, end: el.selectionEnd ?? end } };
  }
  if (!el.isContentEditable) return null;
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  return { element: el, caret: range && el.contains(range.startContainer) ? range.cloneRange() : null };
}

// Readies the field a mic belongs to: focused, with the caret where typing
// would land — kept when the field already had focus, at the end when the
// mic was pressed from somewhere else (the terminal, another input).
export function focusDictationField(el: HTMLElement): void {
  if (document.activeElement === el) return;
  el.focus();
  if (isTextField(el)) {
    el.setSelectionRange(el.value.length, el.value.length);
  } else if (el.isContentEditable) {
    const sel = window.getSelection();
    const end = document.createRange();
    end.selectNodeContents(el);
    end.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(end);
  }
}

const OPENS = /[\s([{"'“‘]$/;
const CLOSES = /^[\s,.;:!?)\]}"'”’]/;

// `text` joined to what's around the caret the way typing it would be: a
// space between it and a word on either side, none beside whitespace, an
// opening bracket, or closing punctuation.
export function spaceDictation(before: string, text: string, after: string): string {
  const words = text.trim();
  if (!words) return "";
  const lead = before && !OPENS.test(before) && !CLOSES.test(words) ? " " : "";
  const trail = after && !CLOSES.test(after) ? " " : "";
  return lead + words + trail;
}

export function insertDictation(target: DictationTarget | null, text: string): boolean {
  if (!target?.element.isConnected) return false;
  const { element, caret } = target;
  if (isTextField(element)) return insertIntoField(element, caret instanceof Range ? null : caret, text);
  if (element.isContentEditable) return insertIntoEditor(element, caret instanceof Range ? caret : null, text);
  return false;
}

function insertIntoField(field: TextField, saved: { start: number; end: number } | null, text: string) {
  if (document.activeElement !== field) {
    field.focus();
    if (saved) {
      const max = field.value.length;
      field.setSelectionRange(Math.min(saved.start, max), Math.min(saved.end, max));
    }
  }
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const insert = spaceDictation(field.value.slice(0, start), text, field.value.slice(end));
  if (!insert) return true;
  // insertText keeps the field's undo stack and fires the input event React
  // listens for; setRangeText is the fallback where it's refused.
  if (document.execCommand("insertText", false, insert)) return true;
  field.setRangeText(insert, start, end, "end");
  field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: insert }));
  return true;
}

function insertIntoEditor(root: HTMLElement, saved: Range | null, text: string) {
  const sel = window.getSelection();
  if (!sel) return false;
  if (document.activeElement !== root) {
    root.focus();
    sel.removeAllRanges();
    if (saved && root.contains(saved.startContainer)) {
      sel.addRange(saved);
    } else {
      const end = document.createRange();
      end.selectNodeContents(root);
      end.collapse(false);
      sel.addRange(end);
    }
  }
  if (sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  // One line: WebKit's insertText turns each "\n" into a new block.
  const flat = text.replace(/\s*\n+\s*/g, " ");
  const insert = spaceDictation(textBefore(root, range), flat, textAfter(root, range));
  return !insert || document.execCommand("insertText", false, insert);
}

function textBefore(root: HTMLElement, caret: Range): string {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(caret.startContainer, caret.startOffset);
  return r.toString();
}

function textAfter(root: HTMLElement, caret: Range): string {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setStart(caret.endContainer, caret.endOffset);
  return r.toString();
}
