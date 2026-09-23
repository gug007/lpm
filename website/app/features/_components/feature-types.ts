import type { LucideIcon } from "lucide-react";

export type FeatureScope = "claude-codex" | "claude" | "github";

export type Feature = {
  title: string;
  body: string;
  note?: string;
  keys?: string[];
  scope?: FeatureScope;
  href?: string;
  linkLabel?: string;
  mono?: boolean;
};

export type Highlight = Feature & { icon: LucideIcon };

export type FeatureArea = {
  id: string;
  title: string;
  description: string;
  highlights: Highlight[];
  features: Feature[];
};
