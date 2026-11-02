import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const PADDING = 80;
const PHONE_COLUMN = 400;
const WINDOW_LEFT = 680;
const WINDOW_WIDTH = 760;
const WINDOW_GAP = 48;
// public/og/lpm-app-window.jpg is 1100 × 700.
const WINDOW_HEIGHT = Math.round((WINDOW_WIDTH * 700) / 1100);
// The bundled face averages about 0.48em per character; the margin covers lines
// heavy with wide letters, so a headline line is sized to fit rather than left
// to wrap mid-phrase.
const CHAR_WIDTH = 0.52;

type OgImageInput = {
  // Each entry is one line; a line is never wrapped, so the size follows the
  // longest one.
  headline: string | string[];
  // Two lines at most.
  subline: string;
  eyebrow?: string;
  platform?: string;
  // A product screen beside the text, as a data URL: a phone screenshot in a
  // device frame, or the desktop app's window running off the right edge.
  image?: { src: string; frame: "phone" | "window" };
};

export function ogImage({
  headline,
  subline,
  eyebrow = "Desktop app for AI coding agents",
  platform = "Free · macOS, Windows, Linux",
  image,
}: OgImageInput): ImageResponse {
  const lines = Array.isArray(headline) ? headline : [headline];
  const textWidth = !image
    ? OG_SIZE.width - PADDING * 2
    : image.frame === "phone"
      ? OG_SIZE.width - PADDING * 2 - PHONE_COLUMN
      : WINDOW_LEFT - PADDING - WINDOW_GAP;
  const longest = Math.max(...lines.map((line) => line.length));
  // A third line leaves the subline too little room at full size.
  const largest = lines.length > 2 ? 76 : 84;
  const fontSize = Math.max(
    56,
    Math.min(largest, Math.floor(textWidth / (longest * CHAR_WIDTH))),
  );

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background:
          "linear-gradient(135deg, #0a0a0a 0%, #111111 60%, #1a1a1a 100%)",
        color: "#ffffff",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          width: textWidth + PADDING * 2,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `72px ${PADDING}px`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background:
                "linear-gradient(135deg, #ffffff 0%, #d4d4d8 60%, #71717a 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0a0a",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: -1,
            }}
          >
            lpm
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: "#9ca3af",
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              backgroundImage:
                "linear-gradient(135deg, #ffffff 0%, #e5e7eb 50%, #9ca3af 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {lines.map((line) => (
              <div key={line} style={{ whiteSpace: "nowrap" }}>
                {line}
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 26,
              color: "#9ca3af",
              lineHeight: 1.4,
              maxWidth: textWidth,
            }}
          >
            {subline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            fontSize: 22,
            color: "#6b7280",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: "#22c55e",
              }}
            />
            lpm.cx
          </div>
          <div>{platform}</div>
        </div>
      </div>

      {image?.frame === "phone" && (
        <div
          style={{
            position: "absolute",
            right: 90,
            top: 64,
            width: 300,
            display: "flex",
            padding: 11,
            borderRadius: 52,
            background: "#050505",
            boxShadow: "0 0 0 1px #2c2c2e, 0 40px 80px rgba(0,0,0,0.6)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            width={278}
            height={604}
            alt=""
            style={{ borderRadius: 42 }}
          />
        </div>
      )}

      {image?.frame === "window" && (
        <div
          style={{
            position: "absolute",
            left: WINDOW_LEFT,
            top: 72,
            display: "flex",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 0 0 1px #3a3a3c, 0 40px 90px rgba(0,0,0,0.7)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            width={WINDOW_WIDTH}
            height={WINDOW_HEIGHT}
            alt=""
          />
        </div>
      )}
    </div>,
    OG_SIZE,
  );
}
