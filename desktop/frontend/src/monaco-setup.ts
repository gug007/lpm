import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import YamlWorker from "./yaml.worker?worker";
import { configureMonacoYaml } from "monaco-yaml";

import projectSchema from "./schemas/project-config.schema.json";
import globalSchema from "./schemas/global-config.schema.json";

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

type WorkerLabel = string;

export const PROJECT_SCHEMA_URI = "lpm://schemas/project-config.json";
export const GLOBAL_SCHEMA_URI = "lpm://schemas/global-config.json";
export const PROJECT_MODEL_URI = "inmemory://lpm/project.yml";
export const GLOBAL_MODEL_URI = "inmemory://lpm/global.yml";

let configured = false;

export function setupMonaco(): typeof monaco {
  if (configured) return monaco;
  configured = true;

  window.MonacoEnvironment = {
    getWorker(_workerId: string, label: WorkerLabel) {
      if (label === "yaml") return new YamlWorker();
      return new EditorWorker();
    },
  };

  configureMonacoYaml(monaco, {
    enableSchemaRequest: false,
    hover: true,
    completion: true,
    validate: true,
    format: true,
    schemas: [
      {
        uri: PROJECT_SCHEMA_URI,
        fileMatch: [PROJECT_MODEL_URI],
        schema: projectSchema as object,
      },
      {
        uri: GLOBAL_SCHEMA_URI,
        fileMatch: [GLOBAL_MODEL_URI],
        schema: globalSchema as object,
      },
    ],
  });

  return monaco;
}
