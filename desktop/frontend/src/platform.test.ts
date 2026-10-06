import { describe, expect, it } from "vitest";
import { detectPlatform, trashName } from "./platform";

describe("detectPlatform", () => {
  it("recognises WKWebView on macOS", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
        "MacIntel",
      ),
    ).toBe("macos");
  });

  it("recognises WebView2 on Windows", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
        "Win32",
      ),
    ).toBe("windows");
  });

  it("recognises WebKitGTK on Linux", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Linux x86_64",
      ),
    ).toBe("linux");
  });

  it("does not mistake Darwin for Windows", () => {
    expect(detectPlatform("Mozilla/5.0 (Darwin) happy-dom", "")).toBe("macos");
  });

  it("falls back to linux for unknown engines", () => {
    expect(detectPlatform("", "")).toBe("linux");
  });
});

describe("trashName", () => {
  it("names the Recycle Bin on Windows and the Trash elsewhere", () => {
    expect(trashName("windows")).toBe("Recycle Bin");
    expect(trashName("macos")).toBe("Trash");
    expect(trashName("linux")).toBe("Trash");
  });
});
