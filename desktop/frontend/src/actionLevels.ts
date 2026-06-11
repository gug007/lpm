import YAML from "yaml";
import {
  type ActionConfigLayer,
  ACTION_SECTIONS,
  hasActionBody,
} from "./actionConfig";
import { splitChild } from "./actionIds";
import { globalLayer, projectLayer, repoLayer } from "./yamlQueue";

export type ActionLevel = ActionConfigLayer; // "project" | "repo" | "global"

export type LevelMap = Map<string, ActionLevel>;

export interface LayerDocs {
  project: string;
  repo: string;
  global: string;
}

function topLevelKeysWithBody(content: string): Set<string> {
  const keys = new Set<string>();
  const doc = YAML.parseDocument(content || "{}");
  for (const section of ACTION_SECTIONS) {
    const node = doc.get(section, true);
    if (!YAML.isMap(node)) continue;
    for (const item of node.items) {
      if (!YAML.isScalar(item.key)) continue;
      if (hasActionBody(item.value)) keys.add(String(item.key.value));
    }
  }
  return keys;
}

// Topmost layer carrying the body wins: project > repo > global.
export function buildLevelMap(docs: LayerDocs): LevelMap {
  const map: LevelMap = new Map();
  const layers: Array<[ActionLevel, string]> = [
    ["global", docs.global],
    ["repo", docs.repo],
    ["project", docs.project],
  ];
  for (const [level, content] of layers) {
    for (const key of topLevelKeysWithBody(content)) map.set(key, level);
  }
  return map;
}

export function levelOf(map: LevelMap, id: string): ActionLevel | null {
  return map.get(splitChild(id)?.parent ?? id) ?? null;
}

export async function loadLevelMap(projectName: string): Promise<LevelMap> {
  const [project, repo, global] = await Promise.all([
    projectLayer(projectName).read().catch(() => ""),
    repoLayer(projectName).read().catch(() => ""),
    globalLayer.read().catch(() => ""),
  ]);
  return buildLevelMap({ project, repo, global });
}
