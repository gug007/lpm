import { describe, expect, it } from "vitest";
import { substituteCommand } from "./commandInputs";

describe("substituteCommand", () => {
  it("leaves plainly safe values unquoted", () => {
    expect(substituteCommand("./deploy.sh --env {{env}}", { env: "staging" })).toBe(
      "./deploy.sh --env staging",
    );
  });

  it("keeps a bare value with a space as one argument", () => {
    expect(substituteCommand("git tag {{tag}}", { tag: "v1 final" })).toBe("git tag 'v1 final'");
  });

  it("keeps shell metacharacters as data", () => {
    expect(substituteCommand("echo {{msg}}", { msg: "hi; rm -rf /" })).toBe("echo 'hi; rm -rf /'");
  });

  it("escapes embedded quotes", () => {
    expect(substituteCommand("echo {{msg}}", { msg: "it's" })).toBe("echo 'it'\\''s'");
  });

  it("turns an empty value into an explicit empty argument", () => {
    expect(substituteCommand("run {{flag}}", { flag: "" })).toBe("run ''");
  });

  it("splices {{key|raw}} verbatim", () => {
    expect(substituteCommand("sh -c {{frag|raw}}", { frag: "a | b" })).toBe("sh -c a | b");
  });

  it("closes a double-quoted string around the answer", () => {
    expect(
      substituteCommand('echo "hello {{who}} from {{place}}"', { who: "Ana Smith", place: "office" }),
    ).toBe(`echo "hello "'Ana Smith'" from office"`);
    expect(substituteCommand('echo "{{x}}"', { x: "$(whoami)" })).toBe(`echo ""'$(whoami)'""`);
    expect(substituteCommand('echo "[{{x}}]"', { x: "" })).toBe('echo "[]"');
  });

  it("escapes only the quote inside single quotes", () => {
    expect(substituteCommand("echo 'hi {{x}}!'", { x: "it's me" })).toBe("echo 'hi it'\\''s me!'");
  });

  it("resets the quoting inside a command substitution", () => {
    expect(substituteCommand('echo "$(printf %s {{x}})" {{y}}', { x: "a b", y: "c d" })).toBe(
      `echo "$(printf %s 'a b')" 'c d'`,
    );
  });

  it("quotes an answer inside backticks for the command they run", () => {
    expect(substituteCommand('echo "`echo {{x}}`"', { x: "$(whoami)" })).toBe(
      "echo \"`echo '\\$(whoami)'`\"",
    );
    expect(substituteCommand("echo `echo {{x}}`", { x: "a`b" })).toBe("echo `echo 'a\\`b'`");
    expect(substituteCommand('echo "`echo \\"{{x}}\\"`"', { x: "$(whoami)" })).toBe(
      "echo \"`echo \\\"\\\"'\\$(whoami)'\\\"\\\"`\"",
    );
    expect(substituteCommand('echo "`date \\"+%Y\\"` {{x}}"', { x: "a b" })).toBe(
      "echo \"`date \\\"+%Y\\\"` \"'a b'\"\"",
    );
    expect(substituteCommand("echo '`{{x}}`'", { x: "a b" })).toBe("echo '`a b`'");
  });

  it("does not open a string at an escaped quote", () => {
    expect(substituteCommand('echo \\"{{x}}', { x: "a b" })).toBe(`echo \\"'a b'`);
    expect(substituteCommand('echo "a\\"{{x}}"', { x: "a b" })).toBe(`echo "a\\""'a b'""`);
  });

  it("leaves tokens without an answer alone", () => {
    expect(substituteCommand("echo {{other}} {{x}}", { x: "y" })).toBe("echo {{other}} y");
  });
});
