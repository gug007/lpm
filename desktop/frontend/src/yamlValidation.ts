import YAML from "yaml";

export function validateYaml(content: string): string | null {
  try {
    YAML.parse(content);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Invalid YAML: ${message}`;
  }
}
