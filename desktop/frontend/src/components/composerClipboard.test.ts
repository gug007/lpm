import { describe, expect, it } from "vitest";
import {
  COMPOSER_CLIPBOARD_ATTR,
  composerCopyHtml,
  lookupCopy,
  registerCopy,
  type ComposerClipboardPayload,
} from "./composerClipboard";

const payload = (n: number): ComposerClipboardPayload => ({
  text: `fix this [Image #${n}]\nsecond line`,
  images: { [n]: `/tmp/img-${n}.png` },
});

describe("copy registry", () => {
  it("round-trips a registered payload by its id", () => {
    const p = payload(1);
    expect(lookupCopy(registerCopy(p))).toEqual(p);
  });

  it("returns null for an unknown (forged) id", () => {
    expect(lookupCopy("not-a-registered-id")).toBeNull();
    expect(lookupCopy("")).toBeNull();
  });

  it("issues a distinct id per copy", () => {
    expect(registerCopy(payload(1))).not.toBe(registerCopy(payload(1)));
  });

  it("evicts the oldest entries beyond the cap while keeping recent ones", () => {
    const first = registerCopy(payload(1));
    const ids = Array.from({ length: 40 }, (_, i) => registerCopy(payload(i)));
    expect(lookupCopy(first)).toBeNull();
    ids.slice(-30).forEach((id, i) => {
      expect(lookupCopy(id)).toEqual(payload(i + 10));
    });
  });
});

describe("composerCopyHtml", () => {
  it("carries the id in the attribute and escapes the visible text", () => {
    const html = composerCopyHtml("the-id", 'a "<b>" & [Image #1]');
    expect(html).toContain(`${COMPOSER_CLIPBOARD_ATTR}="the-id"`);
    const inner = html.slice(html.indexOf(">") + 1, html.lastIndexOf("<"));
    expect(inner).not.toMatch(/[<>]/);
    expect(inner).toContain("&lt;b&gt;");
    expect(inner).toContain("&amp;");
  });

  it("never embeds attachment paths in the markup", () => {
    const p: ComposerClipboardPayload = {
      text: "see [Image #1]",
      images: { "1": "/Users/someone/secret-project/design.png" },
    };
    const html = composerCopyHtml(registerCopy(p), p.text);
    expect(html).not.toContain("secret-project");
    expect(html).not.toContain("/Users/");
  });
});
