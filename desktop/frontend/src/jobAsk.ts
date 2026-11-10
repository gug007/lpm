// What an automation run asked the user, and the answers that let it go on —
// the shape the backend's jobs/askform.rs stores. A question's `type` stays
// open-ended: one this build doesn't know is answered as text.

export type JobAskAnswer = boolean | string[] | string;

export interface JobAskChoice {
  label: string;
  description?: string;
}

export interface JobAskQuestion {
  id: string;
  type: string;
  text: string;
  yes?: string;
  no?: string;
  options?: JobAskChoice[];
  multiple?: boolean;
  // The list also takes an answer in the user's own words.
  other?: boolean;
  multiline?: boolean;
  placeholder?: string;
  optional?: boolean;
  default?: JobAskAnswer;
}

// A question's first line, which is what it asks, and whatever it goes on to
// explain, which reads as text under it.
export function askParts(text: string): { headline: string; details: string } {
  const end = text.indexOf("\n");
  if (end < 0) return { headline: text, details: "" };
  return { headline: text.slice(0, end), details: text.slice(end).trim() };
}

export interface JobAsk {
  id: string;
  askedAt: number;
  questions: JobAskQuestion[];
  expiresAt?: number;
  status: string;
  answers?: Record<string, JobAskAnswer>;
  // The user's own words, when they answered with a plain reply.
  reply?: string;
  answeredAt?: number;
  // Nobody answered in time and the defaults stood in.
  auto?: boolean;
  // What the asker filed it under: one open question per key, none of them
  // holding the job up, and its answer goes to the job's onAnswer command.
  key?: string;
  // On a job row: the project it waits in, and the run entry that asked —
  // absent while that run is still going.
  project?: string;
  at?: number;
}

// What the user has filled in for one question so far.
export interface JobAskDraft {
  picks: string[];
  other: string;
  text: string;
}

export const EMPTY_ASK_DRAFT: JobAskDraft = { picks: [], other: "", text: "" };

export const WAITING_LABEL = "Waiting for your answer";

export function isOpenAsk(ask: JobAsk | undefined): ask is JobAsk {
  return ask?.status === "open";
}

export function yesLabel(q: JobAskQuestion): string {
  return q.yes || "Yes";
}

export function noLabel(q: JobAskQuestion): string {
  return q.no || "No";
}

// One question settled by a single click: its yes or no, or the one option it
// takes.
export function answersOnClick(ask: JobAsk): boolean {
  if (ask.questions.length !== 1) return false;
  const q = ask.questions[0];
  return q.type === "confirm" || (q.type === "choice" && !q.multiple);
}

export function draftAnswer(q: JobAskQuestion, d: JobAskDraft): JobAskAnswer | undefined {
  if (q.type === "confirm") {
    const pick = d.picks[0];
    return pick === "yes" ? true : pick === "no" ? false : undefined;
  }
  if (q.type === "choice") {
    const own = q.other ? d.other.trim() : "";
    const picks = own ? [...d.picks, own] : d.picks;
    return picks.length > 0 ? picks : undefined;
  }
  const text = d.text.trim();
  return text ? text : undefined;
}

// Every answer the drafts give, or the first question still waiting for one.
export function draftAnswers(
  questions: JobAskQuestion[],
  drafts: Record<string, JobAskDraft>,
): { answers: Record<string, JobAskAnswer>; missing: JobAskQuestion | null } {
  const answers: Record<string, JobAskAnswer> = {};
  let missing: JobAskQuestion | null = null;
  for (const q of questions) {
    const a = draftAnswer(q, drafts[q.id] ?? EMPTY_ASK_DRAFT);
    if (a !== undefined) answers[q.id] = a;
    else if (!q.optional && missing === null) missing = q;
  }
  return { answers, missing };
}

// Pick (or unpick) an option: one at a time unless the question takes several.
export function togglePick(q: JobAskQuestion, d: JobAskDraft, label: string): JobAskDraft {
  if (d.picks.includes(label)) return { ...d, picks: d.picks.filter((p) => p !== label) };
  if (q.multiple) return { ...d, picks: [...d.picks, label] };
  return { ...d, picks: [label], other: "" };
}

export function displayAnswer(q: JobAskQuestion, a: JobAskAnswer | undefined): string {
  if (a === undefined) return "";
  if (typeof a === "boolean") return a ? yesLabel(q) : noLabel(q);
  if (Array.isArray(a)) return a.join(", ");
  return a;
}

// How a question ended, for the line over a closed one.
export function askStatusLabel(ask: JobAsk): string {
  switch (ask.status) {
    case "open":
      return WAITING_LABEL;
    case "answered":
      if (ask.auto) return "No answer in time — the default was used";
      return ask.reply !== undefined ? "Answered in a reply" : "Answered";
    case "dismissed":
      return "Skipped";
    case "replaced":
      return "Replaced by a newer question";
    default:
      return "No answer";
  }
}

// The first question, and how many more come with it.
export function askSummary(ask: JobAsk): string {
  const first = ask.questions[0]?.text ?? "";
  return ask.questions.length > 1 ? `${first} (+${ask.questions.length - 1} more)` : first;
}

// "If nobody answers in 3h, it goes with No" for a question with a deadline.
export function askDeadlineNote(ask: JobAsk, nowMs: number = Date.now()): string {
  if (ask.expiresAt === undefined) return "";
  const left = Math.max(0, ask.expiresAt - Math.floor(nowMs / 1000));
  const mins = Math.max(1, Math.ceil(left / 60));
  const span = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  const lead = `If nobody answers in ${span}`;
  const [only] = ask.questions;
  if (ask.questions.length === 1 && only.default !== undefined) {
    return `${lead}, it goes with ${displayAnswer(only, only.default)}`;
  }
  const covered = ask.questions.every((q) => q.default !== undefined || q.optional);
  if (!covered) return `${lead}, the question closes`;
  return ask.questions.some((q) => q.default !== undefined)
    ? `${lead}, it goes on with the defaults`
    : `${lead}, it goes on without an answer`;
}

// The open question a job is waiting on in `project`. A job across several
// projects carries the first one found, with the project it's waiting in.
export function askWaitingIn(ask: JobAsk | undefined, project: string): JobAsk | undefined {
  if (!isOpenAsk(ask)) return undefined;
  return ask.project === undefined || ask.project === project ? ask : undefined;
}

// Every question a job row waits on; an older host sends only `ask`.
export function waitingAsks(job: { ask?: JobAsk; asks?: JobAsk[] }): JobAsk[] {
  if (job.asks) return job.asks.filter(isOpenAsk);
  return isOpenAsk(job.ask) ? [job.ask] : [];
}

// A question asked without a key stops the job's runs until it's answered.
export function holdsJob(ask: JobAsk): boolean {
  return ask.key === undefined;
}
