export const PULL_STRATEGIES = ["ff", "ff-only", "rebase"] as const;
export type PullStrategy = (typeof PULL_STRATEGIES)[number];
export const DEFAULT_PULL_STRATEGY: PullStrategy = "ff";

export const PUSH_MODES = ["default", "force-with-lease"] as const;
export type PushMode = (typeof PUSH_MODES)[number];
export const DEFAULT_PUSH_MODE: PushMode = "default";

export interface GitFetchConfig {
  all: boolean;
  prune: boolean;
  pruneTags: boolean;
  tags: boolean;
}

export const DEFAULT_FETCH_CONFIG: GitFetchConfig = {
  all: true,
  prune: true,
  pruneTags: false,
  tags: false,
};

export interface GitPullConfig {
  strategy: PullStrategy;
  autostash: boolean;
  noVerify: boolean;
}

export interface GitPushConfig {
  mode: PushMode;
  noVerify: boolean;
  tags: boolean;
}

export const DEFAULT_PULL_CONFIG: GitPullConfig = {
  strategy: DEFAULT_PULL_STRATEGY,
  autostash: false,
  noVerify: false,
};

export const DEFAULT_PUSH_CONFIG: GitPushConfig = {
  mode: DEFAULT_PUSH_MODE,
  noVerify: false,
  tags: false,
};

export const PULL_STRATEGY_LABELS: Record<PullStrategy, string> = {
  ff: "Pull (ff if possible)",
  "ff-only": "Pull (ff-only)",
  rebase: "Pull (rebase)",
};

export const PUSH_MODE_LABELS: Record<PushMode, string> = {
  default: "Push",
  "force-with-lease": "Push (force-with-lease)",
};

function isPullStrategy(v: unknown): v is PullStrategy {
  return typeof v === "string" && (PULL_STRATEGIES as readonly string[]).includes(v);
}

function isPushMode(v: unknown): v is PushMode {
  return typeof v === "string" && (PUSH_MODES as readonly string[]).includes(v);
}

export function pullFlags(config: GitPullConfig): string[] {
  const flags: string[] = [];
  if (config.autostash) flags.push("--autostash");
  if (config.noVerify) flags.push("--no-verify");
  return flags;
}

export function pushFlags(config: GitPushConfig): string[] {
  const flags: string[] = [];
  if (config.mode === "force-with-lease") flags.push("--force-with-lease");
  if (config.noVerify) flags.push("--no-verify");
  if (config.tags) flags.push("--tags");
  return flags;
}

export function fetchFlags(config: GitFetchConfig): string[] {
  const flags: string[] = [];
  if (config.all) flags.push("--all");
  if (config.prune) flags.push("--prune");
  if (config.pruneTags) flags.push("--prune-tags");
  if (config.tags) flags.push("--tags");
  return flags;
}

export function normalizeGitPull(raw: unknown, legacyStrategy?: unknown): GitPullConfig {
  const obj = (raw ?? {}) as Partial<GitPullConfig>;
  const strategy = isPullStrategy(obj.strategy)
    ? obj.strategy
    : isPullStrategy(legacyStrategy)
      ? legacyStrategy
      : DEFAULT_PULL_STRATEGY;
  return {
    strategy,
    autostash: !!obj.autostash,
    noVerify: !!obj.noVerify,
  };
}

export function normalizeGitPush(raw: unknown): GitPushConfig {
  const obj = (raw ?? {}) as Partial<GitPushConfig>;
  return {
    mode: isPushMode(obj.mode) ? obj.mode : DEFAULT_PUSH_MODE,
    noVerify: !!obj.noVerify,
    tags: !!obj.tags,
  };
}

export function normalizeGitFetch(raw: unknown): GitFetchConfig {
  const obj = (raw ?? {}) as Partial<GitFetchConfig>;
  return {
    all: obj.all ?? DEFAULT_FETCH_CONFIG.all,
    prune: obj.prune ?? DEFAULT_FETCH_CONFIG.prune,
    pruneTags: !!obj.pruneTags,
    tags: !!obj.tags,
  };
}
