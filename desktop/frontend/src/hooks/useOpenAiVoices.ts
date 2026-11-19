import { useEffect, useState } from "react";
import type { MachineCommands } from "../components/settings/machineCommands";

// OpenAI's voice names from `commands`' machine, fetched while `enabled`.
export function useOpenAiVoices(commands: Pick<MachineCommands, "openAiVoices">, enabled = true): string[] {
  const [voices, setVoices] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    commands
      .openAiVoices()
      .then(setVoices)
      .catch(() => setVoices([]));
  }, [commands, enabled]);
  return voices;
}
