// Reads Cursor CLI's chat for a folder: ~/.cursor/chats/<md5(cwd)>/<chat>/,
// a meta.json (createdAtMs is when the agent took its launch prompt,
// updatedAtMs the last write) beside a store.db whose meta row
// names the latest root blob, a protobuf listing the conversation's message
// blobs in order (JSON: {role, content}).
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const chatsDir = (root) => path.join(os.homedir(), ".cursor", "chats", crypto.createHash("md5").update(root).digest("hex"));

const sql = (db, query) =>
  execFileSync("sqlite3", [db, query], { encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] }).trim();

// Field 1 of the root blob, repeated: each message blob's 32-byte id.
function messageIds(root) {
  const ids = [];
  for (let i = 0; i < root.length; ) {
    const tag = root[i++];
    const wire = tag & 7;
    let len = 0;
    let shift = 0;
    let b;
    do {
      b = root[i++];
      if (wire === 2) len += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    if (wire === 0) continue;
    if (wire !== 2) break;
    if (tag >> 3 === 1 && len === 32) ids.push(root.subarray(i, i + 32).toString("hex"));
    i += len;
  }
  return ids;
}

// The store is in WAL mode, and a read-only connection can't open it without
// its -shm file, so each read queries a copy of the store and its WAL (which
// SQLite replays), never Cursor's own files.
function readChat(dir) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-chat-"));
  try {
    for (const ext of ["", "-wal"]) {
      const src = path.join(dir, `store.db${ext}`);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(copy, `store.db${ext}`));
    }
    return readStore(path.join(copy, "store.db"), JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")));
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

function readStore(db, meta) {
  const head = JSON.parse(Buffer.from(sql(db, "select value from meta where key='0'"), "hex").toString());
  const root = Buffer.from(sql(db, `select hex(data) from blobs where id='${head.latestRootBlobId}'`), "hex");
  const ids = messageIds(root);
  if (ids.length === 0) return { meta, messages: [] };
  const rows = sql(db, `select id, hex(data) from blobs where id in (${ids.map((id) => `'${id}'`).join(",")})`);
  const byId = new Map(rows.split("\n").map((r) => r.split("|")).map(([id, hex]) => [id, Buffer.from(hex, "hex").toString()]));
  const messages = ids.map((id) => {
    try {
      return JSON.parse(byId.get(id));
    } catch {
      return null;
    }
  });
  return { meta, messages: messages.filter(Boolean) };
}

const isPrompt = (m) => m.role === "user" && JSON.stringify(m.content).includes("<user_query>");
const calls = (m) => Array.isArray(m.content) && m.content.some((c) => c.type === "tool-call");

// The newest chat in `root` started after `since`: when the agent created it,
// whether the turn has ended (the last message after the prompt is the
// model's, with no tool call), and meta's last write.
function cursorChat(root, since) {
  const dir = chatsDir(root);
  if (!fs.existsSync(dir)) return null;
  const chats = fs
    .readdirSync(dir)
    .map((n) => path.join(dir, n))
    .filter((d) => fs.existsSync(path.join(d, "store.db")) && fs.existsSync(path.join(d, "meta.json")))
    .map((d) => ({ d, t: fs.statSync(path.join(d, "meta.json")).mtimeMs }))
    .filter(({ t }) => t >= since - 1000)
    .sort((a, b) => b.t - a.t);
  if (chats.length === 0) return null;
  try {
    const { meta, messages } = readChat(chats[0].d);
    const at = messages.findLastIndex(isPrompt);
    const last = messages.at(-1);
    return {
      ended: at >= 0 && last?.role === "assistant" && !calls(last),
      createdAt: meta.createdAtMs,
      updatedAt: meta.updatedAtMs,
    };
  } catch {
    return null;
  }
}

module.exports = { cursorChat };
