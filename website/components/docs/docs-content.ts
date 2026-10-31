import type { ComponentType } from "react";
import { AgentSection } from "@/components/config/ai/agent-section";
import { ActionsSection } from "@/components/config/sections/actions-section";
import { DetectionSection } from "@/components/config/sections/detection-section";
import { EditorSection } from "@/components/config/sections/editor-section";
import { GlobalSection } from "@/components/config/sections/global-section";
import { LayersSection } from "@/components/config/sections/layers-section";
import { PathSection } from "@/components/config/sections/path-section";
import { ProfilesSection } from "@/components/config/sections/profiles-section";
import { ProjectSection } from "@/components/config/sections/project-section";
import { RecipesSection } from "@/components/config/sections/recipes-section";
import { ServicesSection } from "@/components/config/sections/services-section";
import { TemplatesSection } from "@/components/config/sections/templates-section";
import { TerminalsSection } from "@/components/config/sections/terminals-section";
import { ValidationSection } from "@/components/config/sections/validation-section";
import { ZonesSection } from "@/components/config/sections/zones-section";
import type { DocsSlug } from "@/lib/docs-pages";
import { InstallGuide } from "./install-guide";

export const DOCS_CONTENT: Record<DocsSlug, ComponentType> = {
  install: InstallGuide,
  "ask-your-agent": AgentSection,
  editor: EditorSection,
  project: ProjectSection,
  detection: DetectionSection,
  services: ServicesSection,
  actions: ActionsSection,
  terminals: TerminalsSection,
  zones: ZonesSection,
  profiles: ProfilesSection,
  layers: LayersSection,
  "global-config": GlobalSection,
  templates: TemplatesSection,
  recipes: RecipesSection,
  "path-resolution": PathSection,
  validation: ValidationSection,
};
