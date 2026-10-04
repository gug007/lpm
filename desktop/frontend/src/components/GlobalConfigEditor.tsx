import { ReadGlobalConfig } from "../../bridge/commands";
import { GLOBAL_MODEL_URI } from "../monaco-setup";
import { globalLayer, saveLayer } from "../yamlQueue";
import { YamlConfigEditor } from "./YamlConfigEditor";

const save = (content: string) => saveLayer(globalLayer, content);

export function GlobalConfigEditor({ onBack }: { onBack: () => void }) {
  return (
    <YamlConfigEditor
      title="Global Config"
      description="Actions and terminals defined here are available in every project."
      modelUri={GLOBAL_MODEL_URI}
      load={ReadGlobalConfig}
      save={save}
      onBack={onBack}
      docsUrl="https://lpm.cx/config#global-config"
    />
  );
}
