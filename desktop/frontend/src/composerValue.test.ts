import { describe, expect, it } from "vitest";
import {
  composerValueToText,
  EMPTY_COMPOSER,
  quoteImagePathForPaste,
  unquotePastedPath,
} from "./composerValue";

const value = (text: string, images: { token: number; path: string }[] = []) => ({
  text,
  images,
  pending: false,
});

describe("composerValueToText", () => {
  it("keeps a plain prompt verbatim", () => {
    expect(composerValueToText(value("Fix the flaky test.\n\nThen ship."))).toBe(
      "Fix the flaky test.\n\nThen ship.",
    );
  });

  it("is empty for an empty value", () => {
    expect(composerValueToText(EMPTY_COMPOSER)).toBe("");
  });

  it("inlines each attachment's path where its token stood", () => {
    expect(
      composerValueToText(
        value("Match [Image #2] and\nthen[Image #1]ship it", [
          { token: 2, path: "/tmp/lpm/before.png" },
          { token: 1, path: "/tmp/lpm/after.jpeg" },
        ]),
      ),
    ).toBe("Match /tmp/lpm/before.png and\nthen /tmp/lpm/after.jpeg ship it");
  });

  it("drops a token whose image is gone", () => {
    expect(composerValueToText(value("look [Image #1] here"))).toBe("look  here");
  });

  it("trims surrounding whitespace, including around a leading attachment", () => {
    expect(
      composerValueToText(
        value("  [Image #1] describe this  ", [{ token: 1, path: "/tmp/a.png" }]),
      ),
    ).toBe("/tmp/a.png describe this");
  });
});

describe("quoteImagePathForPaste", () => {
  it("passes a path with nothing to quote through byte-for-byte", () => {
    // The common case must reach the agent exactly as it did before quoting
    // existed — Claude Code and Codex both attach a bare single-word path.
    expect(quoteImagePathForPaste("/tmp/a.png")).toBe("/tmp/a.png");
    expect(quoteImagePathForPaste("/tmp/a(1)&c$d;e#f.png")).toBe("/tmp/a(1)&c$d;e#f.png");
  });

  it("double-quotes every character that stops Codex parsing it as one word", () => {
    expect(quoteImagePathForPaste("/tmp/Screenshot 2026-07-30 at 09.37.48.png")).toBe(
      '"/tmp/Screenshot 2026-07-30 at 09.37.48.png"',
    );
    expect(quoteImagePathForPaste("/tmp/tab\tsep.png")).toBe('"/tmp/tab\tsep.png"');
    // An apostrophe or a backslash breaks the parse on its own, with no space
    // anywhere in the path.
    expect(quoteImagePathForPaste("/tmp/Bob's/logo.png")).toBe('"/tmp/Bob\'s/logo.png"');
    expect(quoteImagePathForPaste("/tmp/a\\b.png")).toBe('"/tmp/a\\\\b.png"');
  });

  it("leaves a single quote literal and escapes what would end the quoted run", () => {
    expect(quoteImagePathForPaste("/tmp/Bob's shot.png")).toBe('"/tmp/Bob\'s shot.png"');
    expect(quoteImagePathForPaste('/tmp/a"b c.png')).toBe('"/tmp/a\\"b c.png"');
    expect(quoteImagePathForPaste("/tmp/a\\b c.png")).toBe('"/tmp/a\\\\b c.png"');
    expect(quoteImagePathForPaste('/tmp/a"b.png')).toBe('"/tmp/a\\"b.png"');
  });
});

describe("unquotePastedPath", () => {
  it("recovers the path from every form quoteImagePathForPaste emits", () => {
    // The delivery gate detects an image part by extension, so it has to see
    // through the quoting the same paste applied — padded exactly as sent.
    for (const path of [
      "/tmp/a.png",
      "/tmp/Screenshot 2026-07-30 at 09.37.48.png",
      "/tmp/Bob's shot.png",
      '/tmp/a"b c.png',
      "/tmp/a\\b c.png",
    ]) {
      expect(unquotePastedPath(` ${quoteImagePathForPaste(path)} `)).toBe(path);
    }
  });

  it("leaves unquoted text alone", () => {
    expect(unquotePastedPath("  fix the flaky test  ")).toBe("fix the flaky test");
    expect(unquotePastedPath('"')).toBe('"');
  });

  it("does not unwrap quoted prose, which the image gate would then chase", () => {
    // Only a quoted ABSOLUTE path is an attachment. A message that merely opens
    // and closes with a quote must keep them, or the delivery gate reads it as
    // an image part and waits out the full ceiling for a marker never coming.
    expect(unquotePastedPath('"before.png"')).toBe('"before.png"');
    expect(unquotePastedPath('"rename before.png to after.png"')).toBe(
      '"rename before.png to after.png"',
    );
  });
});
