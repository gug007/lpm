import type { ModelPick } from "./agentModelSwitch";

// What a Claude Code pane says about the session running in it. Claude states
// its model and level in several places, none of which is a readout in the way
// Codex's status line is: the welcome banner is a startup fact, the "/effort"
// confirmation and the chip above the composer are events, and both scroll away
// — on `tui: fullscreen` there is no scrollback for them to scroll into. The one
// standing statement is the ultracode label on the composer's own rule.

// Claude Code answers a "/model" or "/effort" it won't take with its usage line.
const CLAUDE_USAGE_LINE = /^\s*Usage:\s*\/(?:model|effort)\b/gim;

export function claudeRefusals(screen: string): number {
  return [...screen.matchAll(CLAUDE_USAGE_LINE)].length;
}

// Claude names its model by family and version — "Fable 5.1", "Opus 5" — and
// lpm pins models by family alias, so the family word is the whole mapping.
const CLAUDE_FAMILY = "Fable|Opus|Sonnet|Haiku";
// A variant note can follow the version: "Opus 5 (1M context)". It names neither
// the family nor the level, so every reading has to step over it rather than
// stop at it — a model read as far as "Opus 5" and no further matches nothing.
const VARIANT = String.raw`(?:\s*\([^)]*\))?`;
// Claude prints a slash command's answer as a tool result, under the "⎿" elbow
// — so a confirmation does not start its line, and reading only from the line's
// start found none of them. The elbow is all that is allowed in front: anything
// non-letter would make bold prose about setting a level ("**Set effort level to
// max**") read as having set one.
const LINE_LEAD = String.raw`^\s*(?:[⎿└]\s*)?`;

// The welcome banner: "Opus 5 (1M context) with xhigh effort · Claude Max",
// drawn beside the logo's block glyphs on the same line — hence "anything but
// letters" before the name here, not the elbow. The one place Claude prints the
// level unprompted, and only at startup.
const CLAUDE_BANNER = new RegExp(
  String.raw`^[^A-Za-z]*(${CLAUDE_FAMILY})\s+[\d.]+${VARIANT}\s+with\s+([a-z]+)\s+effort\b`,
  "gim",
);
// A status line that prints the model's display name as one " · " segment —
// wherever the user ordered it, first included — redrawn live at the bottom of
// the pane.
const CLAUDE_STATUS = new RegExp(
  String.raw`(?:^[^A-Za-z]*|·\s*)(${CLAUDE_FAMILY})\s+[\d.]+${VARIANT}\s*(?=·|$)`,
  "gim",
);
// What "/model" and "/effort" print when they land. Claude has several phrasings
// of each, depending on whether the pick was saved as a default and whether it
// holds for this session only.
const CLAUDE_MODEL_SET = new RegExp(
  String.raw`${LINE_LEAD}(?:Model set to|Set model to)\s+\`?(${CLAUDE_FAMILY})\b`,
  "gim",
);
const CLAUDE_EFFORT_SET = new RegExp(
  String.raw`${LINE_LEAD}(?:Effort set to|Set effort level to|Effort level set to)\s+([a-z]+)`,
  "gim",
);
// The chip Claude hangs above the composer for a few seconds after a level
// change — "◉ xhigh · /effort". The glyph differs per level, so the level word
// and the command beside it are what this matches, not the glyph.
const CLAUDE_EFFORT_CHIP =
  /(?:^|[\s·])(auto|low|medium|high|xhigh|max|ultracode)\s+·\s+\/effort\b/gim;
// Ultracode is the one level Claude keeps stated: it labels the composer's top
// rule for as long as the session is pinned to it. The rule is redrawn with the
// composer, so this survives a conversation of any length — and it is the only
// thing that does.
const CLAUDE_ULTRACODE_RULE = /─{2,}\s*ultracode\s*─/i;

/** True while the pane shows Claude's ultracode label. */
export function claudeUltracodeMark(screen: string): boolean {
  return CLAUDE_ULTRACODE_RULE.test(screen);
}

/** The lpm model value a transcript's model id names — "claude-opus-5[1m]" is
 *  the Opus row, variant and version alike being the same pick here. */
export function claudeModelValue(model: string): string {
  const family = /claude-(fable|opus|sonnet|haiku)\b/i.exec(model);
  return family ? family[1].toLowerCase() : "";
}

function lastMatch(screen: string, re: RegExp): RegExpMatchArray | undefined {
  const all = [...screen.matchAll(re)];
  return all[all.length - 1];
}

function lowest(screen: string, res: RegExp[]): RegExpMatchArray | undefined {
  const found = res
    .map((re) => lastMatch(screen, re))
    .filter((m): m is RegExpMatchArray => m !== undefined)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return found[found.length - 1];
}

/** What a Claude pane says the session runs, from whichever of its readouts is
 *  visible. Lower on screen wins — newer. Null when nothing on screen names
 *  either half.
 *
 *  The banner and the confirmations are read from scrollback, since both are
 *  one-off lines that the next few turns push above the fold. The ultracode
 *  label is not: it belongs to the composer, which is redrawn in place, so every
 *  frame it was ever drawn in stays in scrollback — including the ones from
 *  before the session left ultracode. Only the live rule states anything. */
export function claudeCurrentPick(screen: string, viewport = screen): ModelPick | null {
  const model = lowest(screen, [CLAUDE_STATUS, CLAUDE_MODEL_SET, CLAUDE_BANNER])?.[1].toLowerCase() ?? "";
  const raw = lowest(screen, [CLAUDE_EFFORT_SET, CLAUDE_EFFORT_CHIP, CLAUDE_BANNER]);
  // The banner's level is its second group; the confirmation's and the chip's
  // is their first.
  const said = (raw ? (raw[2] ?? raw[1]) : "").toLowerCase();
  // Every other reading names the level ultracode *runs at* — xhigh — because
  // that is the level the model is given. The label outranks them all: it is
  // live, so it is also the newest thing on screen.
  const effort = claudeUltracodeMark(viewport) ? "ultracode" : said;
  if (!model && !effort) return null;
  return { model, effort };
}
