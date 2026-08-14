import type { ReplyContext } from "./projects";

export type AgentKind = "claude" | "codex";

export type AgentStep =
  | { kind: "thinking" }
  | { kind: "tool"; label: string; arg: string; result: string }
  | { kind: "text"; text: string; style?: "default" | "muted" };

// A proposal the agent left on the table. Answering "yes" executes it instead
// of falling through to the generic reply, which would just re-ask.
export type ReplyIntent = "fix" | "add" | "refactor" | "docs" | "deploy";

type Reply = { steps: AgentStep[]; intent?: ReplyIntent };

// Mirrors what each CLI actually prints, down to the banner layout, prompt
// glyph and step bullet — the demo terminal is only convincing if a visitor
// who runs these tools daily recognises them at a glance.
export type Brand = {
  glyph: string;
  color: string;
  cmd: string;
  name: string;
  version: string;
  model: string;
  account: string;
  prompt: string;
  bullet: string;
};

export const BRAND: Record<AgentKind, Brand> = {
  claude: {
    glyph: "✻",
    color: "text-[#d97757]",
    cmd: "claude",
    name: "Claude Code",
    version: "v2.1.232",
    model: "Fable 5",
    account: "Claude Max",
    prompt: "❯",
    bullet: "⏺",
  },
  codex: {
    glyph: "◆",
    color: "text-[#ffb242]",
    cmd: "codex",
    name: "Codex",
    version: "v0.147.0",
    model: "gpt-5.6-sol max",
    account: "",
    prompt: "›",
    bullet: "•",
  },
};

// Claude Code labels each turn with a whimsical verb, and swaps it for a past
// tense one once the turn lands.
const VERBS: readonly (readonly [string, string])[] = [
  ["Percolating", "Percolated"],
  ["Cogitating", "Cogitated"],
  ["Noodling", "Noodled"],
  ["Simmering", "Simmered"],
  ["Puzzling", "Puzzled"],
  ["Brewing", "Brewed"],
  ["Churning", "Churned"],
  ["Mulling", "Mulled"],
  ["Ruminating", "Ruminated"],
  ["Spelunking", "Spelunked"],
  ["Wrangling", "Wrangled"],
  ["Marinating", "Marinated"],
];

export function workingVerb(seed: number): string {
  return VERBS[seed % VERBS.length][0];
}

export function settledVerb(seed: number): string {
  return VERBS[(seed + 5) % VERBS.length][1];
}

export const CLAUDE_STARS = ["✢", "✳", "∗", "✻", "✽", "✻", "∗", "✳"];

export const SUGGESTIONS = [
  "What does this project do?",
  "Run the tests",
  "Fix the TODOs",
];

// A canned session that streams agent work and then holds on a live "Thinking…"
// spinner — used to show a project mid-task ("in progress") the moment you open
// it. It never resolves on its own, so the sidebar stays in the running state.
export const IN_PROGRESS_STEPS: AgentStep[] = [
  { kind: "thinking" },
  { kind: "tool", label: "Read", arg: "internal/auth/jwt.go", result: "212 lines" },
  { kind: "tool", label: "Grep", arg: "RotateSigningKey", result: "6 matches" },
  {
    kind: "text",
    text: "Rotating the signing key on a schedule and keeping a grace window so in-flight tokens stay valid.",
  },
  { kind: "tool", label: "Edit", arg: "internal/auth/rotation.go", result: "+48 -6" },
  { kind: "tool", label: "Bash", arg: "go test ./internal/auth/...", result: "running…" },
  { kind: "thinking" },
];

// Extra work trickled into a still-running session so a project you leave open
// keeps visibly advancing instead of freezing on one spinner. Derived from the
// project's own context — a Go service must not report `pnpm test`.
export function keepAliveSteps(ctx: ReplyContext): AgentStep[] {
  return [
    { kind: "tool", label: "Bash", arg: ctx.testCmd, result: ctx.testResult },
    {
      kind: "text",
      text: `Tests pass with the change in place. Tightening the edge cases in ${ctx.focusArea} next.`,
    },
    { kind: "tool", label: "Edit", arg: ctx.focusFile, result: "+22 -0" },
    { kind: "thinking" },
    { kind: "tool", label: "Glob", arg: ctx.sourceGlob, result: ctx.sourceMatches },
  ];
}

export function settleStep(ctx: ReplyContext): AgentStep {
  return {
    kind: "text",
    text: `Done — the change is in place across ${ctx.focusArea} and the suite is green.`,
  };
}

// A finished session — shown fully revealed when a project opens with work
// already complete.
export const DONE_STEPS: AgentStep[] = [
  { kind: "thinking" },
  { kind: "tool", label: "Glob", arg: "src/pages/api/**/*.ts", result: "24 routes" },
  { kind: "tool", label: "Read", arg: "src/content/reference.mdx", result: "88 lines" },
  { kind: "tool", label: "Write", arg: "src/content/reference.mdx", result: "+312 -74" },
  {
    kind: "text",
    text: "Regenerated the API reference from the current routes — 24 endpoints grouped by resource, each with request and response examples.",
  },
  {
    kind: "text",
    text: "The dev server hot-reloaded; the updated page is live at /reference.",
    style: "muted",
  },
];

export const GENERIC_REPLY_CONTEXT: ReplyContext = {
  manifest: "README.md",
  manifestLines: "64 lines",
  sourceGlob: "**/*",
  sourceMatches: "37 matches",
  overview: "Fresh project — nothing indexed yet beyond the files on disk.",
  flows: "Point me at what you're building and I'll dig in.",
  testCmd: "make test",
  testResult: "no tests configured",
  testSummary: "No test suite wired up yet. Want me to scaffold one?",
  focusFile: "README.md",
  focusLines: "64 lines",
  focusArea: "this project",
  hotspotDir: "./",
  deployFile: "README.md",
  deployCmd: "make deploy",
  draftFile: "src/new-feature.ts",
  wireTarget: "the entry point",
};

export function stepDelay(step: AgentStep): number {
  if (step.kind === "thinking") return 650;
  if (step.kind === "tool") return 380;
  return step.text ? 260 : 90;
}

// Keeps invented filenames in the project's own language — a Python pipeline
// must not sprout a helpers.ts.
function sibling(path: string, name: string): string {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const dot = path.lastIndexOf(".");
  const ext = dot > slash ? path.slice(dot) : "";
  return `${dir}${name}${ext}`;
}

const AFFIRMATIVE =
  /^(y|yes|yep|yeah|yup|sure|ok|okay|do it|go ahead|go for it|please do|apply|make the change|sounds good)\b/;

function executeReply(
  intent: ReplyIntent,
  agent: AgentKind,
  ctx: ReplyContext,
): AgentStep[] {
  const done = (text: string): AgentStep[] => [
    { kind: "text", text },
    {
      kind: "text",
      text:
        agent === "claude"
          ? "Anything else you want me to pick up?"
          : "Ready for the next one.",
      style: "muted",
    },
  ];

  switch (intent) {
    case "fix":
      return [
        { kind: "thinking" },
        { kind: "tool", label: "Edit", arg: ctx.focusFile, result: "+14 -3" },
        {
          kind: "tool",
          label: "Edit",
          arg: sibling(ctx.focusFile, "helpers"),
          result: "+6 -6",
        },
        { kind: "tool", label: "Bash", arg: ctx.testCmd, result: ctx.testResult },
        ...done(`All three TODOs in ${ctx.focusArea} are resolved and the suite is green.`),
      ];
    case "add":
      return [
        { kind: "thinking" },
        { kind: "tool", label: "Edit", arg: ctx.draftFile, result: "+61 -4" },
        { kind: "tool", label: "Edit", arg: ctx.focusFile, result: "+8 -1" },
        { kind: "tool", label: "Bash", arg: ctx.testCmd, result: ctx.testResult },
        ...done(`Wired \`${ctx.draftFile}\` into ${ctx.wireTarget} and covered it with a test.`),
      ];
    case "refactor":
      return [
        { kind: "thinking" },
        {
          kind: "tool",
          label: "Edit",
          arg: sibling(ctx.focusFile, "shared"),
          result: "+24 -58",
        },
        { kind: "tool", label: "Edit", arg: ctx.focusFile, result: "+11 -30" },
        { kind: "tool", label: "Bash", arg: ctx.testCmd, result: ctx.testResult },
        ...done(`Pulled the duplicated branches in \`${ctx.hotspotDir}\` into one helper — 53 lines lighter, behaviour unchanged.`),
      ];
    case "docs":
      return [
        { kind: "thinking" },
        { kind: "tool", label: "Write", arg: "README.md", result: "+96 -41" },
        ...done("Regenerated the API section from the current routes."),
      ];
    case "deploy":
      return [
        { kind: "thinking" },
        { kind: "tool", label: "Bash", arg: ctx.testCmd, result: ctx.testResult },
        { kind: "tool", label: "Bash", arg: ctx.deployCmd, result: "deploying…" },
        ...done("Deploy is out — watching the logs for the first minute."),
      ];
  }
}

export function buildReply(
  query: string,
  agent: AgentKind,
  ctx: ReplyContext = GENERIC_REPLY_CONTEXT,
  pending?: ReplyIntent,
): Reply {
  const q = query.trim().toLowerCase();
  if (!q) return { steps: [] };

  if (pending && AFFIRMATIVE.test(q)) {
    return { steps: executeReply(pending, agent, ctx) };
  }

  if (/^(hi|hello|hey|yo)\b/.test(q)) {
    return {
      steps: [
        { kind: "thinking" },
        {
          kind: "text",
          text:
            agent === "claude"
              ? "Hey! What can I help you with in this project?"
              : "Hi. What do you want to work on?",
        },
      ],
    };
  }

  if (/what (is|does)|explain|tell me|overview|summary|describe/.test(q)) {
    return {
      steps: [
        { kind: "thinking" },
        { kind: "tool", label: "Read", arg: ctx.manifest, result: ctx.manifestLines },
        { kind: "tool", label: "Read", arg: "README.md", result: "108 lines" },
        { kind: "tool", label: "Glob", arg: ctx.sourceGlob, result: ctx.sourceMatches },
        { kind: "text", text: ctx.overview },
        { kind: "text", text: "", style: "muted" },
        { kind: "text", text: ctx.flows },
      ],
    };
  }

  if (/test|spec|vitest|jest|rspec/.test(q)) {
    return {
      steps: [
        { kind: "thinking" },
        { kind: "tool", label: "Bash", arg: ctx.testCmd, result: ctx.testResult },
        { kind: "text", text: ctx.testSummary },
      ],
    };
  }

  if (/fix|bug|error|failing|broken|crash|todo/.test(q)) {
    return {
      intent: "fix",
      steps: [
        { kind: "thinking" },
        { kind: "tool", label: "Grep", arg: "TODO|FIXME", result: "3 matches" },
        { kind: "tool", label: "Read", arg: ctx.focusFile, result: ctx.focusLines },
        {
          kind: "text",
          text:
            agent === "claude"
              ? `Found 3 TODOs in ${ctx.focusArea}. Want me to patch them or walk you through what each one is blocking?`
              : `3 TODOs in ${ctx.focusArea}. I can draft a patch or leave them as-is — which?`,
        },
      ],
    };
  }

  if (/deploy|ship|release|production/.test(q)) {
    return {
      intent: "deploy",
      steps: [
        { kind: "thinking" },
        { kind: "tool", label: "Bash", arg: "git status --porcelain", result: "clean" },
        { kind: "tool", label: "Read", arg: ctx.deployFile, result: "68 lines" },
        {
          kind: "text",
          text: `Tree is clean. I can run \`${ctx.deployCmd}\` when you're ready — but you'll want to run the full test suite first.`,
        },
      ],
    };
  }

  if (/refactor|clean|simplify|rewrite/.test(q)) {
    return {
      intent: "refactor",
      steps: [
        { kind: "thinking" },
        { kind: "tool", label: "Glob", arg: ctx.sourceGlob, result: ctx.sourceMatches },
        {
          kind: "text",
          text: `Scanning for duplication and long functions. A few hotspots jump out in \`${ctx.hotspotDir}\` — want me to propose a refactor plan before touching anything?`,
        },
      ],
    };
  }

  if (/add|implement|build|create|new/.test(q)) {
    return {
      intent: "add",
      steps: [
        { kind: "thinking" },
        { kind: "tool", label: "Read", arg: ctx.focusFile, result: ctx.focusLines },
        { kind: "tool", label: "Write", arg: ctx.draftFile, result: "draft" },
        {
          kind: "text",
          text: `Drafted a skeleton in \`${ctx.draftFile}\`. Want me to wire it up into ${ctx.wireTarget} next?`,
        },
      ],
    };
  }

  if (/document|docs|readme|comments/.test(q)) {
    return {
      intent: "docs",
      steps: [
        { kind: "thinking" },
        { kind: "tool", label: "Read", arg: "README.md", result: "108 lines" },
        {
          kind: "text",
          text: "README covers setup but the API section is stale. I can regenerate it from the current routes if that's useful.",
        },
      ],
    };
  }

  if (/^(thanks|thank you|cool|great|nice|perfect)\b/.test(q)) {
    return { steps: [{ kind: "text", text: agent === "claude" ? "Anytime." : "👍" }] };
  }

  return {
    intent: "add",
    steps: [
      { kind: "thinking" },
      { kind: "tool", label: "Read", arg: ctx.manifest, result: ctx.manifestLines },
      {
        kind: "text",
        text:
          agent === "claude"
            ? "Got it — taking a look. Want me to just describe the plan, or go ahead and make the change?"
            : "Looking now. Draft a plan or apply changes directly?",
      },
    ],
  };
}
