import { ImageResponse } from "next/og";

export const alt =
  "lpm — Local Project Manager. Start projects in one click. Run AI agents in parallel.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0a0a0a 0%, #111111 60%, #1a1a1a 100%)",
          color: "#ffffff",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
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
            Local Project Manager
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              backgroundImage:
                "linear-gradient(135deg, #ffffff 0%, #e5e7eb 50%, #9ca3af 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            <div>Start projects in one click.</div>
            <div>Run AI agents in parallel.</div>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#9ca3af",
              lineHeight: 1.4,
              maxWidth: 980,
            }}
          >
            A CLI and native macOS app for managing local dev projects — run
            Claude Code, Codex, and more side by side on the same codebase.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
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
          <div>macOS · CLI · Desktop</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
