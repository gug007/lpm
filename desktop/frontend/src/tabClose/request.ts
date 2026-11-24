// What `lpm close` asks of the window that owns a project's tabs, and what the
// window says back (tab_close.rs, the CLI's close.rs).

/** What only the backend knows of a terminal. */
export interface TabFacts {
  agent?: "working" | "waiting";
  /** Its agent was just launched by `lpm run` and hasn't reported yet. */
  starting?: boolean;
  /** `lpm run` opened it moments ago, so its command may not be typed yet. */
  launching?: boolean;
  /** Whether a program is in front of its shell, other than an agent lpm follows;
   *  unset where that can't be told, as on another machine. */
  busy?: boolean;
  /** An agent in it has reported, so the program in front may be that agent. */
  reported?: boolean;
}

export interface CloseTabRequest {
  project: string;
  /** A tab's id or its name. */
  tab: string;
  /** The tab the command runs in; empty when it runs in none. */
  own: string;
  force: boolean;
  whenDone: boolean;
  facts: Record<string, TabFacts>;
}

export type CloseRefusal =
  | "pinned"
  | "own"
  | "ownIdle"
  | "working"
  | "waiting"
  | "starting"
  | "command"
  | "unsent"
  | "scheduled";

export interface NamedTab {
  tab: string;
  name: string;
}

export type CloseTabAnswer =
  | ({ ok: true; result: "closed" | "whenDone" | "firstTurn" } & NamedTab)
  | ({ ok: false; result: "refused"; reason: CloseRefusal; detail?: string } & NamedTab)
  | { ok: false; result: "notFound" | "ambiguous" | "notOpen"; tabs: NamedTab[] };

type Closer = (request: CloseTabRequest) => Promise<CloseTabAnswer>;

const closers = new Map<string, Closer>();

/** Answers the closes asked of `project` while its tabs are in this window. */
export function answerTabCloses(project: string, closer: Closer): () => void {
  closers.set(project, closer);
  return () => {
    if (closers.get(project) === closer) closers.delete(project);
  };
}

export async function closeTabAsked(request: CloseTabRequest): Promise<CloseTabAnswer> {
  const closer = closers.get(request.project);
  return closer ? closer(request) : { ok: false, result: "notOpen", tabs: [] };
}
