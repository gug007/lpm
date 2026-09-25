import { CLAUDE_DOT, CODEX_DOT } from "./page-styles";
import type { WindowKind } from "./pace-model";
import type { Provider } from "./stats-sample-data";

export type { Provider };

export const PROVIDERS: Record<Provider, { name: string; dot: string }> = {
  claude: { name: "Claude", dot: CLAUDE_DOT },
  codex: { name: "Codex", dot: CODEX_DOT },
};

export type PresetId = "sprint" | "cruising" | "steady" | "hit" | "fresh";

export type Preset = {
  id: PresetId;
  label: string;
  provider: Provider;
  kind: WindowKind;
  elapsedMinutes: number;
  used: number;
};

export const PRESETS: Preset[] = [
  { id: "sprint", label: "Morning sprint", provider: "claude", kind: "fiveHour", elapsedMinutes: 165, used: 72 },
  { id: "cruising", label: "Room to spare", provider: "claude", kind: "weekly", elapsedMinutes: 4620, used: 38 },
  { id: "steady", label: "On pace", provider: "codex", kind: "weekly", elapsedMinutes: 5220, used: 57 },
  { id: "hit", label: "Just hit it", provider: "claude", kind: "fiveHour", elapsedMinutes: 210, used: 100 },
  { id: "fresh", label: "Fresh window", provider: "codex", kind: "fiveHour", elapsedMinutes: 10, used: 6 },
];

export const DEFAULT_PRESET = PRESETS[0];
