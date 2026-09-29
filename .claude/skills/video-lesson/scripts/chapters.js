// YouTube chapters for a take: every topic card starts one (named after the
// card), a narration line can start one with `"chapter": "<name>"`, and the
// first is at 0:00. YouTube shows them only with at least three, each ten
// seconds or longer, starting at 0:00; problems come back with the list.
const MIN_MS = 10000;
const SAME_MS = 2000;

function chapters(timeline, lesson) {
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
  return { list: merged.map(({ ms, name }) => ({ ms, name })), problems };
}

const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const chaptersText = (list) => list.map((c) => `${mmss(c.ms)} ${c.name}`).join("\n") + "\n";

module.exports = { chapters, chaptersText, mmss };
