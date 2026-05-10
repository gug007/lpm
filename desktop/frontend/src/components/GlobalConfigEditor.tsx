import { ReadGlobalConfig, SaveGlobalConfig } from "../../wailsjs/go/main/App";
import { GLOBAL_MODEL_URI } from "../monaco-setup";
import { YamlConfigEditor } from "./YamlConfigEditor";

export function GlobalConfigEditor({ onBack }: { onBack: () => void }) {
  return (
    <YamlConfigEditor
      title="Global Config"
      description="Actions and terminals defined here are available in every project."
      modelUri={GLOBAL_MODEL_URI}
      load={ReadGlobalConfig}
      save={SaveGlobalConfig}
      onBack={onBack}
      docsUrl="https://lpm.cx/config#global-config"
    />
  );
}
