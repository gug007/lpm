// A note for a peer tab whose terminal had ended on the other machine by the time
// the tab came back, so a new one was started in its place. Written once into the
// new screen, so a fresh prompt where the old session used to be explains itself.
//
// The restore that starts the replacement queues it and the pane that builds the
// new screen takes it. Taking is what keeps it to once: a pane that finds a screen
// already built, or any pane after the first, finds nothing.

const notices = new Map<string, string>();

const ENDED = "The session in this tab ended on the other machine";

// What the restore is about to type into the new terminal decides the second half,
// mirroring its own choice: the resume command first, then the launch command.
export function relaunchNoticeFor(tab: { resumeCmd?: string; startCmd?: string }): string {
  if (tab.resumeCmd) return `[${ENDED} — resuming it]`;
  if (tab.startCmd) return `[${ENDED} — starting it again]`;
  return `[${ENDED} — this is a new shell]`;
}

export function queueRelaunchNotice(terminalId: string, text: string): void {
  notices.set(terminalId, text);
}

export function takeRelaunchNotice(terminalId: string): string | undefined {
  const text = notices.get(terminalId);
  notices.delete(terminalId);
  return text;
}

export function discardRelaunchNotices(terminalIds: Iterable<string>): void {
  for (const id of terminalIds) notices.delete(id);
}

export function relaunchNoticeLine(text: string): string {
  return `\x1b[90m${text}\x1b[0m\r\n`;
}

// A new screen's first output is the host's replay, and it opens by clearing the
// screen and the scrollback — a note written ahead of it would be wiped before it
// was ever seen. So the chunk is split just after that clear, and the note goes
// between the halves, above whatever the new shell printed. A chunk with no such
// clear has nothing to go under: it all follows the note.
const SCREEN_CLEAR = "\x1b[2J\x1b[3J\x1b[H";

export function splitAfterScreenClear(chunk: string): [string, string] {
  const at = chunk.indexOf(SCREEN_CLEAR);
  if (at === -1) return ["", chunk];
  const end = at + SCREEN_CLEAR.length;
  return [chunk.slice(0, end), chunk.slice(end)];
}

export type NoticePlacement = { before: string; notice: string; after: string };

// Where a pane's note goes in each chunk of its output; null for a chunk that takes
// none. It stays pending until it lands on a screen that has been sized: one drawn
// before that is replayed in full when the pane is first measured
// (repairBlindScreen), and that replay's clear takes the note with it. Until then
// only a chunk that clears the screen takes it again, so it never stacks up.
export function relaunchNoticePlacer(
  text: string | undefined,
): (chunk: string, sized: boolean) => NoticePlacement | null {
  let pending = text;
  let written = false;
  return (chunk, sized) => {
    if (pending === undefined) return null;
    const [before, after] = splitAfterScreenClear(chunk);
    if (written && !before) return null;
    const notice = relaunchNoticeLine(pending);
    written = true;
    if (sized) pending = undefined;
    return { before, notice, after };
  };
}
