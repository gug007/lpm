import { describe, expect, it } from "vitest";
import { isVideoPath, mediaKind, mediaSrc, videoMime } from "./fileMedia";

describe("mediaKind", () => {
  it("classifies images and videos", () => {
    expect(mediaKind("/a/b/shot.png")).toBe("image");
    expect(mediaKind("/a/b/icon.SVG")).toBe("image");
    expect(mediaKind("/a/b/clip.mp4")).toBe("video");
    expect(mediaKind("/a/b/clip.MOV")).toBe("video");
  });

  it("leaves everything else to the text reader", () => {
    expect(mediaKind("/a/b/main.rs")).toBeNull();
    expect(mediaKind("/a/b/README")).toBeNull();
    // Extension-shaped only at the end: a dotted directory must not count.
    expect(mediaKind("/a/clip.mp4/notes.txt")).toBeNull();
  });
});

describe("isVideoPath", () => {
  it("covers the containers the viewer routes to the video arm", () => {
    for (const ext of ["mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv"]) {
      expect(isVideoPath(`/x/y.${ext}`)).toBe(true);
    }
    expect(isVideoPath("/x/y.mp3")).toBe(false);
  });
});

describe("videoMime", () => {
  it("maps containers to the type the element is asked about", () => {
    expect(videoMime("/x/y.mp4")).toBe("video/mp4");
    expect(videoMime("/x/y.m4v")).toBe("video/mp4");
    expect(videoMime("/x/y.MOV")).toBe("video/quicktime");
    expect(videoMime("/x/y.webm")).toBe("video/webm");
    expect(videoMime("/x/y.mkv")).toBe("video/x-matroska");
    expect(videoMime("/x/y.txt")).toBe("");
  });
});

describe("mediaSrc", () => {
  it("sends the path as one percent-encoded segment", () => {
    expect(mediaSrc("/Users/me/Movies/clip.mp4")).toBe(
      "lpm-media://localhost/%2FUsers%2Fme%2FMovies%2Fclip.mp4",
    );
  });

  it("encodes characters that would otherwise split or truncate the URL", () => {
    const src = mediaSrc("/Users/me/Screen Recording #2?.mov");
    expect(src).toContain("%20");
    expect(src).toContain("%23");
    expect(src).toContain("%3F");
    expect(decodeURIComponent(src.replace("lpm-media://localhost/", ""))).toBe(
      "/Users/me/Screen Recording #2?.mov",
    );
  });
});
