import { useId } from "react";

export type Agent = "claude" | "codex" | "gemini" | "opencode";

const CLAUDE_SPARK =
  "M13.9 12L13.3 1.6A1.3 1.3 0 0 0 10.7 1.6L10.1 12ZM13.46 13.22L18.65 6.09A1.3 1.3 0 0 0 16.66 4.42L10.54 10.78ZM12.68 13.77L21.8 9.63A1.3 1.3 0 0 0 20.87 7.2L11.32 10.23ZM11.32 13.77L19.56 16.3A1.3 1.3 0 0 0 20.49 13.87L12.68 10.23ZM10.5 13.17L17.32 20.92A1.3 1.3 0 0 0 19.37 19.32L13.5 10.83ZM10.1 11.93L10.39 20.95A1.3 1.3 0 0 0 12.99 21.04L13.9 12.07ZM10.39 10.99L5.7 19.62A1.3 1.3 0 0 0 7.91 21L13.61 13.01ZM11.44 10.18L3.4 13.27A1.3 1.3 0 0 0 4.16 15.76L12.56 13.82ZM12.68 10.23L2.94 7.13A1.3 1.3 0 0 0 2.01 9.56L11.32 13.77ZM13.5 10.83L7.61 4.27A1.3 1.3 0 0 0 5.56 5.87L10.5 13.17Z";
const GEMINI_SPARKLE =
  "M12 2C12.6 7.2 16.8 11.4 22 12C16.8 12.6 12.6 16.8 12 22C11.4 16.8 7.2 12.6 2 12C7.2 11.4 11.4 7.2 12 2Z";

// The marks the desktop app draws on its terminal tabs
// (desktop/frontend/src/components/terminal/AgentGlyph.tsx), so the site
// shows each agent the way the app does.
export function AgentMark({
  agent,
  className,
}: {
  agent: Agent;
  className?: string;
}) {
  const gradientId = `agent-mark-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`shrink-0 ${className ?? ""}`}>
      {agent === "claude" && <path fill="#D97757" d={CLAUDE_SPARK} />}
      {agent === "codex" && (
        <g
          fill="none"
          stroke="#10A37F"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 1.8 20.83 6.9v10.2L12 22.2l-8.83-5.1V6.9z" />
          <path d="M8.2 9.2 11 12l-2.8 2.8m4.4 0H16" />
        </g>
      )}
      {agent === "gemini" && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#4796E3" />
              <stop offset="0.55" stopColor="#9177C7" />
              <stop offset="1" stopColor="#CA6673" />
            </linearGradient>
          </defs>
          <path fill={`url(#${gradientId})`} d={GEMINI_SPARKLE} />
        </>
      )}
      {agent === "opencode" && (
        <g fill="currentColor">
          <path fillRule="evenodd" d="M4 3h16v18H4zM8 7v10h8V7z" />
          <path opacity={0.45} d="M8 12h8v5H8z" />
        </g>
      )}
    </svg>
  );
}
