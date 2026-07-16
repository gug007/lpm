import { AI_CLI_OPTIONS } from "./types";
import { getSettings } from "./store/settings";

// Reasoning-effort options for the agent a prompt will actually run with: an
// explicit pick, or the app's default agent when the model is "Default".
// Gemini and OpenCode have no effort control, which hides the Effort picker.
export function effortsFor(agent: string): { value: string; label: string }[] {
  const effective = agent || (getSettings().aiCli as string) || "claude";
  return AI_CLI_OPTIONS.find((o) => o.value === effective)?.efforts ?? [];
}

// One flat list for a Model picker: the app default, then each agent with its
// models. Values encode "agent|model" so a pick pins both.
export const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "|", label: "Default" },
  ...AI_CLI_OPTIONS.flatMap((cli) => {
    const models = (cli.models ?? []).filter((m) => m.value);
    if (models.length === 0) return [{ value: `${cli.value}|`, label: cli.label }];
    return [
      { value: `${cli.value}|`, label: cli.label },
      ...models.map((m) => ({
        value: `${cli.value}|${m.value}`,
        label: `${cli.label} · ${m.label}`,
      })),
    ];
  }),
];
