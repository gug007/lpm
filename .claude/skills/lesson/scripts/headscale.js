// A private tailnet for lessons about built-in Tailscale: a local Headscale
// (a Tailscale-compatible coordination server) that the lesson app and lpm
// Link join instead of anyone's real tailnet, so no account or email of the
// user's ever reaches the recording. Both nodes read its address from
// TS_CONTROL_URL. Signing in is the one step a real account would take in a
// browser; here a small proxy in front of Headscale answers the sign-in page
// with a plain "Signing in…" page and approves the device itself.
// Built from the Go module cache: `go install
// github.com/juanfont/headscale/cmd/headscale@v0.29.4` with GOBIN set to
// ~/Library/Caches/lpm-video-lesson/bin (preflight lists it when missing).
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { CACHE } = require("./helpers");
const { sleep } = require("./words");

const BIN = path.join(CACHE, "bin", "headscale");
const HOME = path.join(CACHE, "headscale");
const PORTS = { proxy: 18480, server: 18481, grpc: 18482, metrics: 18483 };
const CONTROL_URL = `http://127.0.0.1:${PORTS.proxy}`;

const config = (user) => `server_url: ${CONTROL_URL}
listen_addr: 127.0.0.1:${PORTS.server}
metrics_listen_addr: 127.0.0.1:${PORTS.metrics}
grpc_listen_addr: 127.0.0.1:${PORTS.grpc}
grpc_allow_insecure: true
noise:
  private_key_path: ${HOME}/noise_private.key
prefixes:
  v4: 100.64.0.0/10
  v6: fd7a:115c:a1e0::/48
  allocation: sequential
derp:
  server:
    enabled: false
  urls:
    - https://controlplane.tailscale.com/derpmap/default
  auto_update_enabled: false
disable_check_updates: true
database:
  type: sqlite
  sqlite:
    path: ${HOME}/db.sqlite
log:
  level: warn
dns:
  magic_dns: false
  override_local_dns: false
  base_domain: ${user}.lesson.test
unix_socket: ${HOME}/hs.sock
unix_socket_permission: "0770"
logtail:
  enabled: false
`;

const SIGNING_IN = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signing in</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
    font: 17px -apple-system, system-ui, sans-serif; color: #3c3c43; background: #f2f2f7; }
  .spin { width: 28px; height: 28px; border-radius: 50%; border: 3px solid #d1d1d6; border-top-color: #8e8e93; animation: s .8s linear infinite; }
  @keyframes s { to { transform: rotate(360deg); } }
</style>
<div class="spin"></div><div>Signing in…</div>`;

const authId = (url) => {
  const m = /\/register\/([^/?#]+)/.exec(String(url || ""));
  return m ? m[1] : null;
};

// `user` is the account both devices sign in to (what the apps show as the
// A picture of the real sign-in page (`page`, a PNG at the phone's width)
// shown instead of the plain one, so the video shows what a viewer will see.
const pictured = (file) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in</title>
<style>html, body { margin: 0; background: #fff; } img { display: block; width: 100%; }</style>
<img alt="" src="data:image/png;base64,${fs.readFileSync(file).toString("base64")}">`;

// Tailscale account); `approveAfterMs` is how long the sign-in page stays up
// before the device is let in (null: until approvePending); `page` pictures
// the real sign-in page.
async function startHeadscale({ user = "alex", approveAfterMs = 1200, page = null, log = () => {} } = {}) {
  const signInPage = page ? pictured(page) : SIGNING_IN;
  if (!fs.existsSync(BIN)) {
    throw new Error(`no Headscale at ${BIN}: GOBIN=${path.dirname(BIN)} go install github.com/juanfont/headscale/cmd/headscale@v0.29.4`);
  }
  fs.rmSync(HOME, { recursive: true, force: true });
  fs.mkdirSync(HOME, { recursive: true });
  const cfg = path.join(HOME, "config.yaml");
  fs.writeFileSync(cfg, config(user));
  const hs = (...args) =>
    new Promise((resolve, reject) =>
      execFile(BIN, ["-c", cfg, ...args], { encoding: "utf8" }, (e, out, err) => (e ? reject(new Error(`headscale ${args.join(" ")}: ${err || e.message}`)) : resolve(out))),
    );

  const server = spawn(BIN, ["-c", cfg, "serve"], { stdio: ["ignore", "ignore", "pipe"] });
  let serverLog = "";
  server.stderr.on("data", (d) => (serverLog = (serverLog + d).slice(-4000)));
  const approved = new Set();
  let pending = null;
  const approve = async (url) => {
    const id = authId(url);
    if (!id) throw new Error(`not a sign-in address: ${url}`);
    if (approved.has(id)) return;
    approved.add(id);
    await hs("auth", "register", "--auth-id", id, "--user", user);
    log(`tailnet: signed in ${id.slice(0, 8)}… as ${user}`);
  };

  const proxy = http.createServer((req, res) => {
    if (req.method === "GET" && authId(req.url)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(signInPage);
      pending = req.url;
      if (approveAfterMs != null) setTimeout(() => approve(req.url).catch((e) => log(`tailnet: ${e.message}`)), approveAfterMs);
      return;
    }
    const up = http.request({ host: "127.0.0.1", port: PORTS.server, method: req.method, path: req.url, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on("error", () => res.destroy());
    req.pipe(up);
  });
  // The control protocol is an HTTP upgrade; after the handshake both sides
  // are piped through untouched.
  proxy.on("upgrade", (req, socket, head) => {
    const up = net.connect(PORTS.server, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(lines.join("\r\n") + "\r\n\r\n");
      if (head?.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    const close = () => {
      socket.destroy();
      up.destroy();
    };
    up.on("error", close);
    socket.on("error", close);
  });
  await new Promise((resolve, reject) => proxy.listen(PORTS.proxy, "127.0.0.1", resolve).on("error", reject));

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    proxy.close();
    if (server.exitCode == null) server.kill("SIGTERM");
  };
  for (let i = 0; ; i++) {
    try {
      await hs("users", "create", user);
      break;
    } catch (e) {
      if (server.exitCode != null || i > 40) {
        await stop();
        throw new Error(`Headscale did not start: ${e.message}\n${serverLog}`);
      }
      await sleep(250);
    }
  }
  log(`tailnet: Headscale at ${CONTROL_URL}, account "${user}"`);
  // The sign-in page last opened through the proxy (the phone's sheet), let
  // in when a beat says so (with `approveAfterMs: null`).
  const approvePending = async () => {
    if (!pending) throw new Error("tailnet: no sign-in page has been opened");
    await approve(pending);
  };
  return { url: CONTROL_URL, user, approve, approvePending, stop, nodes: async () => JSON.parse(await hs("nodes", "list", "-o", "json") || "[]") };
}

module.exports = { startHeadscale, CONTROL_URL, BIN, authId };
