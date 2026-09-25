import {
  CLAUDE_M,
  CODEX_M,
  HISTORY_DAYS,
  MIX,
  MODEL_SPLIT,
  PROJECTS,
  PROVIDERS,
  RATES,
  SESSIONS,
  SESSION_DIVISOR,
  TODAY_SESSION_COUNT,
  type Period,
  type Provider,
  type SampleSession,
} from "./stats-sample-data";

const MILLION = 1_000_000;
const ALL_TIME_CHART_DAYS = 28;

export type DayPoint = {
  ago: number;
  claude: number;
  codex: number;
  cost: Record<Provider, number>;
};

export type ProjectRow = { name: string; tokens: number; sessions: number };
export type ProjectSortKey = "tokens" | "sessions" | "name";
export type SortDirection = "asc" | "desc";
export type ProjectSort = { key: ProjectSortKey; dir: SortDirection };

export type CompositionPart = {
  key: "input" | "cached" | "output" | "reasoning";
  label: "Input" | "Cached" | "Output" | "Reasoning";
  tokens: number;
  share: number;
};

export type TokenParts = {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  total: number;
};

export type PeriodStats = {
  days: DayPoint[];
  chartDays: DayPoint[];
  tokens: Record<Provider, number>;
  totals: TokenParts;
  cost: number;
  sessions: Record<Provider, number>;
  sessionCount: number;
  peak: DayPoint | null;
  projects: ProjectRow[];
  modelCount: number;
  composition: CompositionPart[];
  recentSessions: readonly SampleSession[];
};

export const DEFAULT_SORT: ProjectSort = { key: "tokens", dir: "desc" };

const DEFAULT_DIR: Record<ProjectSortKey, SortDirection> = {
  tokens: "desc",
  sessions: "desc",
  name: "asc",
};

const byName = (a: string, b: string) => a.localeCompare(b, "en");

function costPerMTok(provider: Provider): number {
  const mix = MIX[provider];
  return MODEL_SPLIT[provider].reduce((sum, [model, share]) => {
    const [input, cacheWrite, cacheRead, output] = RATES[model];
    return (
      sum +
      share *
        (mix.fresh * input +
          mix.cacheWrite * cacheWrite +
          mix.cacheRead * cacheRead +
          mix.output * output)
    );
  }, 0);
}

export const COST_PER_MTOK: Record<Provider, number> = {
  claude: costPerMTok("claude"),
  codex: costPerMTok("codex"),
};

// Half-to-even, so an exact tie such as 22.1 / 2.6 = 8.5 rounds the way the published sample totals do.
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  if (Math.abs(value - floor - 0.5) > 1e-9) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

export function tokenParts(provider: Provider, tokens: number): TokenParts {
  const mix = MIX[provider];
  return {
    input: tokens * (mix.fresh + mix.cacheWrite + mix.cacheRead),
    cached: tokens * (mix.cacheWrite + mix.cacheRead),
    output: tokens * mix.output,
    reasoning: tokens * mix.reasoning,
    total: tokens,
  };
}

function addParts(a: TokenParts, b: TokenParts): TokenParts {
  return {
    input: a.input + b.input,
    cached: a.cached + b.cached,
    output: a.output + b.output,
    reasoning: a.reasoning + b.reasoning,
    total: a.total + b.total,
  };
}

export const dayTotal = (day: DayPoint) => day.claude + day.codex;

function periodDays(period: Period): DayPoint[] {
  const first = period === 0 ? 0 : HISTORY_DAYS - period;
  const days: DayPoint[] = [];
  for (let index = first; index < HISTORY_DAYS; index++) {
    const claude = CLAUDE_M[index];
    const codex = CODEX_M[index];
    if (claude + codex <= 0) continue;
    days.push({
      ago: HISTORY_DAYS - 1 - index,
      claude: claude * MILLION,
      codex: codex * MILLION,
      cost: { claude: claude * COST_PER_MTOK.claude, codex: codex * COST_PER_MTOK.codex },
    });
  }
  return days;
}

function mostActiveDay(days: DayPoint[]): DayPoint | null {
  let peak: DayPoint | null = null;
  for (const day of days) {
    if (dayTotal(day) > 0 && (!peak || dayTotal(day) > dayTotal(peak))) peak = day;
  }
  return peak;
}

function projectsFromShares(total: number, sessionCount: number): ProjectRow[] {
  const kept = PROJECTS.map(([name, tokenShare, sessionShare]) => ({
    name,
    tokenShare,
    sessions: Math.round(sessionCount * sessionShare),
  })).filter((project) => project.sessions > 0);
  const shareSum = kept.reduce((sum, project) => sum + project.tokenShare, 0);
  return kept.map(({ name, tokenShare, sessions }) => ({
    name,
    sessions,
    tokens: (total * tokenShare) / shareSum,
  }));
}

function projectsFromSessions(sessions: readonly SampleSession[]): ProjectRow[] {
  const rows = new Map<string, ProjectRow>();
  for (const session of sessions) {
    const row = rows.get(session.project) ?? { name: session.project, tokens: 0, sessions: 0 };
    row.tokens += session.m * MILLION;
    row.sessions += 1;
    rows.set(session.project, row);
  }
  return [...rows.values()];
}

function composition(totals: TokenParts): CompositionPart[] {
  const values = {
    input: Math.max(0, totals.input - totals.cached),
    cached: totals.cached,
    output: Math.max(0, totals.output - totals.reasoning),
    reasoning: totals.reasoning,
  };
  const sum = values.input + values.cached + values.output + values.reasoning;
  const labels = { input: "Input", cached: "Cached", output: "Output", reasoning: "Reasoning" } as const;
  return (Object.keys(values) as CompositionPart["key"][]).map((key) => ({
    key,
    label: labels[key],
    tokens: values[key],
    share: values[key] / Math.max(1, sum),
  }));
}

export function periodStats(period: Period): PeriodStats {
  const days = periodDays(period);
  const tokens = { claude: 0, codex: 0 };
  const sessions = { claude: 0, codex: 0 };
  let cost = 0;
  for (const day of days) {
    for (const provider of PROVIDERS) {
      tokens[provider] += day[provider];
      sessions[provider] += roundHalfEven(day[provider] / MILLION / SESSION_DIVISOR[provider]);
      cost += day.cost[provider];
    }
  }
  const totals = addParts(tokenParts("claude", tokens.claude), tokenParts("codex", tokens.codex));
  const sessionCount = sessions.claude + sessions.codex;
  const recentSessions = period === 1 ? SESSIONS.slice(0, TODAY_SESSION_COUNT) : SESSIONS;
  const projects =
    period === 1
      ? projectsFromSessions(recentSessions)
      : projectsFromShares(totals.total, sessionCount);

  return {
    days,
    chartDays: period === 0 ? days.slice(-ALL_TIME_CHART_DAYS) : days,
    tokens,
    totals,
    cost,
    sessions,
    sessionCount,
    peak: mostActiveDay(days),
    projects,
    modelCount: new Set(recentSessions.map((session) => session.model)).size,
    composition: composition(totals),
    recentSessions,
  };
}

export function sortProjects(projects: ProjectRow[], sort: ProjectSort): ProjectRow[] {
  return [...projects].sort((a, b) => {
    const primary =
      sort.key === "name"
        ? byName(a.name, b.name)
        : sort.key === "sessions"
          ? a.sessions - b.sessions
          : a.tokens - b.tokens;
    if (primary !== 0) return sort.dir === "asc" ? primary : -primary;
    return byName(a.name, b.name);
  });
}

export function nextSort(current: ProjectSort, key: ProjectSortKey): ProjectSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: DEFAULT_DIR[key] };
}

export function defaultDirection(key: ProjectSortKey): SortDirection {
  return DEFAULT_DIR[key];
}

export function sessionParts(session: SampleSession): TokenParts {
  return tokenParts(session.provider, session.m * MILLION);
}

export function visibleDay(day: DayPoint, hidden: ReadonlySet<Provider>) {
  const claude = hidden.has("claude") ? 0 : day.claude;
  const codex = hidden.has("codex") ? 0 : day.codex;
  const cost =
    (hidden.has("claude") ? 0 : day.cost.claude) + (hidden.has("codex") ? 0 : day.cost.codex);
  return { claude, codex, total: claude + codex, cost };
}
