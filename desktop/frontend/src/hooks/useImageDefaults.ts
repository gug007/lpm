import { useEffect, useState } from "react";
import { LOCAL_GENERATE } from "../components/settings/generateCommands";
import type { GenerateChoice, GenerateKeys } from "../generate";
import { useSettingsStore } from "../store/settings";

// The image model `lpm generate` uses on this computer, as Settings › Images &
// speech picked it, with what it costs and whether its key is saved. Null
// until the first answer.
export function useImageDefaults(): { model: GenerateChoice | null; keyed: boolean | null } | null {
  const [models, setModels] = useState<{ list: GenerateChoice[]; fallback: string } | null>(null);
  const [keys, setKeys] = useState<GenerateKeys | null>(null);
  const picked = useSettingsStore((s) => s.generateImageModel);

  useEffect(() => {
    let live = true;
    LOCAL_GENERATE.options()
      .then((o) => live && setModels({ list: o.imageModels, fallback: o.defaultImageModel }))
      .catch(() => {});
    LOCAL_GENERATE.keys()
      .then((k) => live && setKeys(k))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!models) return null;
  const id = picked ?? models.fallback;
  const model = models.list.find((m) => m.id === id) ?? models.list[0] ?? null;
  const keyed = model && keys ? keys[model.provider === "OpenAI" ? "openai" : "gemini"] : null;
  return { model, keyed };
}
