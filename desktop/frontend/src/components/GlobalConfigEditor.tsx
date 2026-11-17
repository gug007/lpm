import { useCallback, useMemo } from "react";
import { GLOBAL_MODEL_URI } from "../monaco-uris";
import type { SettingsMachine } from "../settingsMachine";
import { globalLayerOf, saveLayer } from "../yamlQueue";
import { YamlConfigEditor } from "./YamlConfigEditor";
import { NAV_ICONS } from "./settings/navIcons";

export function GlobalConfigEditor({ machine }: { machine: SettingsMachine }) {
  const slug = machine.kind === "peer" ? machine.slug : null;
  const name = machine.kind === "peer" ? machine.name : null;
  const layer = useMemo(() => globalLayerOf(slug), [slug]);
  const save = useCallback((content: string) => saveLayer(layer, content), [layer]);
  return (
    <YamlConfigEditor
      title={name ? `Global config · ${name}` : "Global config"}
      description={`Actions and terminals defined here are available in every project${
        name ? ` on ${name}` : ""
      }.`}
      icon={NAV_ICONS["global-config"]}
      placeholder="actions:  # buttons and terminals every project gets"
      modelUri={GLOBAL_MODEL_URI}
      load={layer.read}
      save={save}
      draftKey={layer.queueKey}
      docsUrl="https://lpm.cx/docs/global-config"
    />
  );
}
