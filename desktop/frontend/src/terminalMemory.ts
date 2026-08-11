// Which lpm-memory session a terminal is working under, and how a sent prompt
// reveals it. Nothing else in the UI says so: an agent handed "/lpm-memory
// auth-refactor" keeps writing to that session for the rest of the conversation,
// and twenty tabs later there's no way to tell which ones are recording. The
// composer's brain lights up from this.

export interface TerminalMemoryRef {
  // The session the terminal is continuing. Absent while a bare "remember this
  // conversation" waits for the agent to name the file it writes — the slug is
  // the agent's to pick, so it isn't known at send time (see soleChangedSession).
  session?: string;
}

// The invocation in either CLI's form: "/lpm-memory" runs the skill in Claude
// Code, "$lpm-memory" is the skill mention every other agent gets. The session
// argument follows the backend's slug rule (session_memory_files.rs).
//
// Matched anywhere a word can start, not just at the head of the prompt: both
// the footer button and the "@" menu insert the invocation AT THE CARET, so a
// user who was mid-sentence when they reached for a session ends up with it
// inline. Anchoring to the line start would miss exactly the case this exists
// for. The cost is that a prompt which merely talks about the command reads as
// one — rare, visible, and one click of Detach to undo.
const INVOCATION_RE = /(?:^|\s)[/$]lpm-memory(?:[ \t]+([a-z0-9][a-z0-9-]{0,63}))?(?=[ \t]|$)/im;

export interface MemoryInvocation {
  // The session named in the invocation, or null for the bare form.
  session: string | null;
}

// Read a prompt on its way into a terminal. An array payload is one prompt in
// ordered paste parts (text runs and image paths), so it concatenates to the
// text the agent actually receives.
export function scanMemoryInvocation(payload: string | string[]): MemoryInvocation | null {
  const text = Array.isArray(payload) ? payload.join("") : payload;
  const match = INVOCATION_RE.exec(text);
  if (!match) return null;
  return { session: match[1] ? match[1].toLowerCase() : null };
}

// Fold an invocation into what the terminal already had, returning `current`
// unchanged when it says nothing new — the caller compares by identity to skip
// a pointless tree update and the terminals.json write behind it.
//
// A bare save inside a conversation that is already continuing a session writes
// to THAT session, so it leaves the mark alone instead of demoting it back to
// "unnamed"; only a bare save in an unmarked terminal is waiting for a name.
export function mergeMemoryRef(
  current: TerminalMemoryRef | undefined,
  session: string | null,
): TerminalMemoryRef {
  if (!session) return current ?? {};
  return current?.session === session ? current : { session };
}

export function isMemoryPending(ref: TerminalMemoryRef | undefined): boolean {
  return ref !== undefined && ref.session === undefined;
}

// The one session that appeared or was written to between two reads of the
// memory folder, or null when the answer is ambiguous. This is what names a
// pending mark: a bare save either creates a session or appends to one the
// agent picked itself, so both show up here — but with two sessions touched
// between reads there is no way to tell which belongs to the terminal, and a
// brain labelled with the wrong session is worse than one labelled "new".
//
// `updatedAt` is only ever compared against another `updatedAt`: the backend
// reports it in SECONDS, so mixing it with Date.now() millis would read as
// "just now" forever.
export function soleChangedSession(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): string | null {
  let found: string | null = null;
  for (const [name, updatedAt] of after) {
    const previous = before.get(name);
    if (previous !== undefined && updatedAt <= previous) continue;
    if (found !== null) return null;
    found = name;
  }
  return found;
}
