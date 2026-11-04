// Turns the raw comment cache (STATE/raw, which only this code reads) into
// what the agent may read: STATE/labels.json and a few summary lines. Comments
// without a label go to classify.js, newest first and at most MAX_PER_RUN a
// run; the rest wait for the next run. Nothing viewer-written leaves: no
// text, no handle; a comment is named by its ref and a link built from ids.
const fs = require("fs");
const path = require("path");
const { label } = require("./classify");

const MAX_PER_RUN = 150;
const VIDEO_ID = /^([A-Za-z0-9_-]{11}|\d{15,25})$/;
const COMMENT_ID = /^([A-Za-z0-9_-]{10,60}(\.[A-Za-z0-9_-]{10,60})?|\d{15,25})$/;
const TAG = { youtube: "yt", tiktok: "tt" };
const NOT_COUNTED = new Set(["spam", "abusive"]);

// Whether we answered this very comment: on a top-level comment, any reply of
// ours in its thread; on a reply, one of ours after it that is addressed to it
// (TikTok's reply-to id, YouTube's leading @handle).
function answered(c, all) {
  return Object.values(all).some((r) => {
    if (!r.ours || String(r.at) < String(c.at)) return false;
    if (!c.parent) return r.parent === c.id;
    if (r.parent !== c.parent) return false;
    return r.replyTo ? r.replyTo === c.id : Boolean(c.author) && r.text.startsWith(c.author);
  });
}

const permalink = (platform, videoId, commentId) =>
  platform === "youtube" ? `https://www.youtube.com/watch?v=${videoId}&lc=${commentId}` : `https://www.tiktok.com/@lpm06557/video/${videoId}`;

function rows(cache, titles) {
  const out = [];
  for (const platform of ["youtube", "tiktok"]) {
    for (const [videoId, entry] of Object.entries(cache[platform] || {})) {
      if (!VIDEO_ID.test(videoId)) continue;
      const all = entry.comments || {};
      for (const c of Object.values(all)) {
        if (c.ours || !COMMENT_ID.test(String(c.id))) continue;
        out.push({
          ref: `${TAG[platform]}:${videoId}:${c.id}`,
          platform,
          videoId,
          commentId: c.id,
          link: permalink(platform, videoId, c.id),
          likes: Number.isInteger(c.likes) ? c.likes : 0,
          at: /^\d{4}-\d{2}-\d{2}$/.test(c.at) ? c.at : null,
          isReply: Boolean(c.parent),
          answered: answered(c, all),
          author: c.author,
          text: c.text,
          video: titles.get(`${platform}:${videoId}`) || null,
          parentText: c.parent ? all[c.parent]?.text : null,
        });
      }
    }
  }
  return out;
}

function update({ state, cache, videos, deadline, writeAtomic }) {
  const file = path.join(state, "labels.json");
  let stored = {};
  if (fs.existsSync(file)) stored = JSON.parse(fs.readFileSync(file, "utf8")).labels || {};
  for (const l of Object.values(stored)) delete l.author;
  const titles = new Map(videos.map((v) => [`${v.platform}:${v.id}`, v.title]));
  const all = rows(cache, titles);
  const todo = all
    .filter((c) => !stored[c.ref])
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, MAX_PER_RUN);
  const run = todo.length ? label(todo, { deadline }) : { labels: {}, failed: [], cost: 0, errors: [] };
  const labels = { ...stored, ...run.labels };

  const people = new Map();
  const comments = all
    .filter((c) => labels[c.ref])
    .map(({ author, text, video, parentText, ...c }) => {
      people.set(c.ref, author || c.ref);
      const l = labels[c.ref];
      return { ...c, ...l, replyable: l.replyable && !c.answered };
    });
  const byKey = new Map();
  for (const c of comments) {
    const key = c.request?.key;
    if (!key || NOT_COUNTED.has(c.kind) || c.flags.includes("bot_like")) continue;
    const r = byKey.get(key) || { key, sides: c.request.sides, format: c.request.format, who: new Set(), likes: 0, latest: null, refs: [], open: 0 };
    r.who.add(people.get(c.ref));
    r.likes += c.likes;
    if (c.at && (!r.latest || c.at > r.latest)) r.latest = c.at;
    r.refs.push(c.ref);
    if (c.replyable) r.open++;
    byKey.set(key, r);
  }
  const requests = [...byKey.values()]
    .map(({ who, ...r }) => ({ ...r, mentions: who.size }))
    .sort((a, b) => b.mentions - a.mentions || b.likes - a.likes || String(b.latest).localeCompare(String(a.latest)));
  const byIdea = new Map();
  for (const c of comments) {
    if (!c.idea || NOT_COUNTED.has(c.kind) || c.flags.includes("bot_like")) continue;
    const r = byIdea.get(c.idea) || { idea: c.idea, who: new Set(), likes: 0, latest: null, refs: [] };
    r.who.add(people.get(c.ref));
    r.likes += c.likes;
    if (c.at && (!r.latest || c.at > r.latest)) r.latest = c.at;
    r.refs.push(c.ref);
    byIdea.set(c.idea, r);
  }
  const ideas = [...byIdea.values()]
    .map(({ who, ...r }) => ({ ...r, mentions: who.size }))
    .sort((a, b) => b.mentions - a.mentions || b.likes - a.likes);
  const unresolved = [...new Set(comments.flatMap((c) => c.request?.unresolved || []))];
  const ambiguous = [...new Set(comments.flatMap((c) => c.request?.ambiguous || []))];
  const pending = all.length - comments.length;
  writeAtomic(file, JSON.stringify({ at: new Date().toISOString(), comments, requests, ideas, unresolved, ambiguous, pending, labels }, null, 1));

  const topics = {};
  for (const c of comments) if (c.kind === "question") topics[c.topic] = (topics[c.topic] || 0) + 1;
  const replyable = comments.filter((c) => c.replyable);
  const lines = [
    `Comments: ${comments.length} labelled (${Object.keys(run.labels).length} this run, $${run.cost.toFixed(3)}), ${pending} waiting for a label.`,
    ...run.errors.map((e) => `  error: labelling: ${e}`),
    "Requests (matchup | people | likes | latest | replyable):",
    ...(requests.length ? requests.map((r) => `  ${r.key} | ${r.mentions} | ${r.likes} | ${r.latest || "?"} | ${r.open}`) : ["  none"]),
    "Video ideas that aren't races (subject | people | likes | latest):",
    ...(ideas.length ? ideas.map((r) => `  ${r.idea} | ${r.mentions} | ${r.likes} | ${r.latest || "?"}`) : ["  none"]),
    `Models viewers named that no CLI here runs: ${unresolved.length ? unresolved.join(", ") : "none"}`,
    `Names that fit several models here: ${ambiguous.length ? ambiguous.join(", ") : "none"}`,
    `Questions by topic: ${Object.entries(topics).map(([t, n]) => `${t} ${n}`).join(", ") || "none"}`,
    `Replyable comments: ${replyable.length} (yt ${replyable.filter((c) => c.platform === "youtube").length}, tt ${replyable.filter((c) => c.platform === "tiktok").length})`,
    `Details per comment, without any viewer text: ${file}`,
  ];
  return { lines, failed: todo.length > 0 && Object.keys(run.labels).length === 0 };
}

module.exports = { update, answered };
