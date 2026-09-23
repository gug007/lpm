import { AGENT_SETUP_AREA } from "./data-agent-setup";
import { AGENTS_AREA, COMPOSER_AREA } from "./data-agents";
import { CLI_AREA, PLATFORM_AREA } from "./data-cli-platform";
import { DEVICES_AREA, IPHONE_AREA } from "./data-devices";
import { AUTOMATIONS_AREA } from "./data-ops";
import { GIT_AREA, PARALLEL_AREA } from "./data-parallel-git";
import { PROJECTS_AREA } from "./data-projects";
import type { FeatureArea } from "./feature-types";

export const FEATURE_AREAS: FeatureArea[] = [
  PROJECTS_AREA,
  AGENTS_AREA,
  COMPOSER_AREA,
  PARALLEL_AREA,
  GIT_AREA,
  AUTOMATIONS_AREA,
  AGENT_SETUP_AREA,
  DEVICES_AREA,
  IPHONE_AREA,
  CLI_AREA,
  PLATFORM_AREA,
];

export const FEATURE_COUNT = FEATURE_AREAS.reduce(
  (total, area) => total + area.highlights.length + area.features.length,
  0,
);
