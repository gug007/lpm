import type { Terminal } from "@xterm/xterm";
import type { SerializeAddon } from "@xterm/addon-serialize";

// Cleans terminal selections before they hit the clipboard:
//   1. merges soft-wrapped rows back into one logical line
//   2. detects and strips agent gutter prefixes (Claude Code's "      ▎ " etc.)
//   3. dedents any common leading whitespace that remains
//   4. trims trailing whitespace and collapses excess blank lines
//   5. writes both `text/plain` and `text/html` so rich-text paste targets
//      keep ANSI colors via @xterm/addon-serialize

// TUIs and agents print a left-margin gutter to mark a region of output.
const GUTTER_BAR_CHARS = "▎▏▌│┃";
const GUTTER_LINE_RE = new RegExp(`^(\\s*[${GUTTER_BAR_CHARS}])`);
const LEADING_WS_RE = /^[ \t]*/;

// Fraction of non-blank lines that must share the same prefix for it to be
// treated as a gutter (rather than incidental content with a bar character).
const GUTTER_MATCH_RATIO = 0.8;

interface CleanRules {
  gutter: string | null;
  dedent: number;
}

function detectGutterPrefix(text: string): string | null {
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return null;

  const counts = new Map<string, number>();
  for (const line of lines) {
    const m = line.match(GUTTER_LINE_RE);
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }

  let bestPrefix = "";
  let bestCount = 0;
  for (const [prefix, count] of counts) {
    if (count > bestCount) {
      bestPrefix = prefix;
      bestCount = count;
    }
  }
  return bestCount / lines.length >= GUTTER_MATCH_RATIO ? bestPrefix : null;
}

function leadingWhitespaceLength(line: string): number {
  return line.match(LEADING_WS_RE)![0].length;
}

function commonIndent(text: string): number {
  let min = Infinity;
  for (const line of text.split("\n")) {
    if (!/\S/.test(line)) continue;
    const n = leadingWhitespaceLength(line);
    if (n < min) min = n;
  }
  return min === Infinity ? 0 : min;
}

function stripGutter(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.startsWith(prefix)) return line;
      const rest = line.slice(prefix.length);
      return rest.startsWith(" ") ? rest.slice(1) : rest;
    })
    .join("\n");
}

function dedentLines(text: string, n: number): string {
  if (n <= 0) return text;
  return text
    .split("\n")
    .map((line) => line.slice(Math.min(n, leadingWhitespaceLength(line))))
    .join("\n");
}

function normalize(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function detectRules(selection: string): CleanRules {
  const gutter = detectGutterPrefix(selection);
  // Measure indent against the gutter-stripped text so any padding the agent
  // added inside the gutter is also captured.
  const stripped = gutter ? stripGutter(selection, gutter) : selection;
  return { gutter, dedent: commonIndent(stripped) };
}

function cleanPlainText(selection: string, rules: CleanRules): string {
  let out = selection;
  if (rules.gutter) out = stripGutter(out, rules.gutter);
  if (rules.dedent > 0) out = dedentLines(out, rules.dedent);
  return normalize(out);
}

function isEmptySpan(node: Node | null): boolean {
  return (
    !!node &&
    node.nodeType === Node.ELEMENT_NODE &&
    (node as Element).tagName === "SPAN" &&
    node.childNodes.length === 0
  );
}

// Drops `count` leading characters from `row` by walking text nodes in order
// and removing or trimming them. Cleans up any spans that become empty.
function stripLeadingCharsFromRow(row: Element, count: number): void {
  const doc = row.ownerDocument;
  if (!doc || count <= 0) return;

  const walker = doc.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) textNodes.push(node as Text);

  let remaining = count;
  for (const t of textNodes) {
    if (remaining <= 0) break;
    const text = t.textContent ?? "";
    if (text.length <= remaining) {
      remaining -= text.length;
      const parent = t.parentNode;
      t.remove();
      if (isEmptySpan(parent)) parent!.parentNode?.removeChild(parent!);
    } else {
      t.textContent = text.slice(remaining);
      remaining = 0;
    }
  }
}

// Applies the same gutter + dedent transforms to the HTML serialization that
// were applied to the plain text. addon-serialize emits each row as
// `<div><span>...</span></div>` inside a styled `<div>` inside `<pre>`.
function cleanHtml(html: string, rules: CleanRules): string {
  if (!rules.gutter && rules.dedent === 0) return html;

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const row of doc.querySelectorAll("pre > div > div")) {
      const text = row.textContent ?? "";

      let strip = 0;
      if (rules.gutter && text.startsWith(rules.gutter)) {
        strip = rules.gutter.length;
        if (text.charAt(strip) === " ") strip += 1;
      }
      if (rules.dedent > 0) {
        const after = text.slice(strip);
        strip += Math.min(rules.dedent, leadingWhitespaceLength(after));
      }

      stripLeadingCharsFromRow(row, strip);
    }
    return doc.documentElement.outerHTML;
  } catch {
    return html;
  }
}

// xterm.getSelection() joins every buffer row with `\n`, including rows that
// the terminal soft-wrapped from a longer logical line. Walk the buffer so
// rows with `isWrapped` attach to the previous row without a newline.
//
// Caveat: this only catches the terminal's own soft-wrap. Programs that hard-
// wrap their output (writing literal `\n` plus continuation indent — e.g.
// Claude Code's markdown renderer) emit real newlines that look identical to
// user-typed ones once they reach the buffer, so they can't be merged back.
function getSelectionRespectingWraps(term: Terminal): string {
  const pos = term.getSelectionPosition();
  if (!pos) return term.getSelection();

  const buffer = term.buffer.active;
  const parts: string[] = [];

  for (let y = pos.start.y; y <= pos.end.y; y++) {
    const line = buffer.getLine(y);
    if (!line) continue;

    const startX = y === pos.start.y ? pos.start.x : 0;
    const endX = y === pos.end.y ? pos.end.x : undefined;
    const text = line.translateToString(false, startX, endX);

    // The first selected row is always a fresh line, even if it happens to
    // be a wrap continuation — the user picked it as their starting point.
    if (y > pos.start.y && line.isWrapped) {
      parts[parts.length - 1] += text;
    } else {
      parts.push(text);
    }
  }

  return parts.join("\n");
}

async function writeClipboard(plain: string, html: string | null): Promise<void> {
  if (html && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // Rich write rejected — fall through to plain-text only.
    }
  }
  await navigator.clipboard.writeText(plain);
}

interface ClipboardPayload {
  plain: string;
  html: string | null;
}

function buildClipboardPayload(
  term: Terminal,
  serialize: SerializeAddon | null,
): ClipboardPayload | null {
  const selection = getSelectionRespectingWraps(term);
  if (!selection) return null;

  const rules = detectRules(selection);
  const plain = cleanPlainText(selection, rules);
  // A whitespace-only selection cleans to nothing — don't blank the clipboard.
  if (!/\S/.test(plain)) return null;

  let html: string | null = null;
  if (serialize) {
    try {
      html = cleanHtml(serialize.serializeAsHTML({ onlySelection: true }), rules);
    } catch {
      // serializeAsHTML can throw if the buffer is in an unexpected state.
    }
  }

  return { plain, html };
}

export function copyTerminalSelection(
  term: Terminal,
  serialize: SerializeAddon | null,
): void {
  const payload = buildClipboardPayload(term, serialize);
  if (!payload) return;
  void writeClipboard(payload.plain, payload.html).catch(() => {});
}

export function isCopyShortcut(e: KeyboardEvent): boolean {
  if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
  const key = e.key.toLowerCase();
  if (key === "c") return true;
  // Non-Latin layouts (e.g. Russian "с") keep ⌘C on the physical C key but
  // report their own letter; Latin layouts that move "c" elsewhere (Dvorak)
  // must not match the physical key.
  return e.code === "KeyC" && !/^[a-z]$/.test(key);
}

// Returns true if the event was a Cmd+C over a live selection that we copied.
// Callers should return `false` from their attachCustomKeyEventHandler so
// xterm doesn't also process the event. Without a selection the event is left
// untouched — the running app may own the mouse (and with it the selection),
// in which case the chord belongs to the app, not to us.
export function handleCopyShortcut(
  e: KeyboardEvent,
  term: Terminal,
  serialize: SerializeAddon | null,
): boolean {
  if (!(isCopyShortcut(e) && e.type === "keydown")) return false;
  const payload = buildClipboardPayload(term, serialize);
  if (!payload) return false;
  // Stop WebKit's native Cmd+C from clobbering our clipboard write with the
  // raw selection from xterm's hidden helper textarea.
  e.preventDefault();
  void writeClipboard(payload.plain, payload.html).catch(() => {});
  return true;
}

// Populates a native copy (Edit menu, context menu) with the same cleaned
// payload the shortcut path produces, instead of xterm's raw selection text.
export function handleNativeCopy(
  e: ClipboardEvent,
  term: Terminal,
  serialize: SerializeAddon | null,
): boolean {
  if (!e.clipboardData) return false;
  const payload = buildClipboardPayload(term, serialize);
  if (!payload) return false;
  e.preventDefault();
  e.stopPropagation();
  e.clipboardData.setData("text/plain", payload.plain);
  if (payload.html) e.clipboardData.setData("text/html", payload.html);
  return true;
}

export function handleSelectAllShortcut(e: KeyboardEvent, term: Terminal): boolean {
  if (
    !(
      e.type === "keydown" &&
      e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      e.key.toLowerCase() === "a"
    )
  ) {
    return false;
  }
  e.preventDefault();
  term.selectAll();
  return true;
}

export function handleClearShortcut(
  e: KeyboardEvent,
  term: Terminal,
  opts?: { force?: boolean; onClear?: () => void },
): boolean {
  if (
    !(
      e.type === "keydown" &&
      e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      e.key.toLowerCase() === "l"
    )
  ) {
    return false;
  }
  if (!opts?.force && term.buffer.active.type === "alternate") return false;
  e.preventDefault();
  if (opts?.onClear) opts.onClear();
  else term.clear();
  return true;
}
