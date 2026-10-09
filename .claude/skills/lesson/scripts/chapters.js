// YouTube chapters for a take: every topic card starts one (named after the
// card), a narration line can start one with `"chapter": "<name>"`, and the
// first is at 0:00. YouTube shows them only with at least three, each ten
// seconds or longer, starting at 0:00; problems come back with the list.
const MIN_MS = 10000;
const SAME_MS = 2000;

// `spoken` (optional) maps a line id to its last word's end in ms from the
// line's start, so a chapter doesn't replay much of the line before.
function chapters(timeline, lesson, spoken = {}) {
  const narration = lesson.narration || [];
  const byId = new Map(narration.map((n) => [n.id, n]));
  const marks = [];
  for (const c of timeline.cards || []) {
    if (c.hold || c.first) continue;
    marks.push({ ms: c.startMs, name: c.title, from: "card" });
  }
  for (const t of timeline.lines) {
    const name = byId.get(t.id)?.chapter;
    if (name) marks.push({ ms: t.startMs, name, from: "line" });
  }
  marks.sort((a, b) => a.ms - b.ms);
  const merged = [];
  for (const m of marks) {
    const near = merged.find((x) => Math.abs(x.ms - m.ms) < SAME_MS);
    if (!near) merged.push({ ...m });
    else if (m.from === "line") Object.assign(near, { name: m.name, from: "line" });
  }
  const first = narration[0]?.chapter || "Intro";
  if (!merged.length || merged[0].ms >= SAME_MS) merged.unshift({ ms: 0, name: first, from: "start" });
  else merged[0].ms = 0;
  // The last chapter runs to the start of the silent end card.
  const outro = timeline.lines.at(-1);
  const endMs = outro && !byId.get(outro.id)?.text ? outro.startMs : timeline.totalMs;
  const problems = [];
  if (merged.length < 3) problems.push(`${merged.length} chapter(s); YouTube needs at least 3 (add "chapter" to narration lines in lesson.json)`);
  merged.forEach((m, i) => {
    const len = (i + 1 < merged.length ? merged[i + 1].ms : endMs) - m.ms;
    if (len < MIN_MS) problems.push(`"${m.name}" lasts ${(len / 1000).toFixed(1)} s; YouTube needs 10 s or more`);
  });
  return { list: merged.map(({ ms, name }) => ({ ms: ms && onSecond(ms, timeline.lines, spoken), name })), problems };
}

// YouTube starts a chapter on a whole second. The second before the line's
// first word, when the line before has finished by then; else the second
// after it, when that cuts nothing you'd hear; else the second before, as
// the end of a word before beats the start of one cut off.
function onSecond(ms, lines, spoken = {}) {
  // The clip's own start: a transcript can miss a line's first words.
  const first = ms;
  const prevEnd = Math.max(0, ...lines.filter((l) => l.startMs < ms - 1 && l.ms).map((l) => l.startMs + (spoken[l.id] ? spoken[l.id].last : l.ms)));
  const down = Math.floor(first / 1000) * 1000;
  const up = Math.ceil(first / 1000) * 1000;
  if (down >= prevEnd) return down;
  return up - first <= 30 ? up : down;
}

const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const chaptersText = (list) => list.map((c) => `${mmss(c.ms)} ${c.name}`).join("\n") + "\n";

module.exports = { chapters, chaptersText, mmss };
