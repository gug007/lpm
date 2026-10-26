import { describe, expect, it } from "vitest";
import { applyConfigYaml, configYaml } from "./config";
import type { Project } from "./state";

const project = (): Project => ({
  name: "myapp",
  root: "~/Projects/myapp",
  remote: false,
  worktree: false,
  services: [{ name: "dev", cmd: "echo 'configure me'", log: [] }],
  actions: [],
  profiles: [],
  zones: [],
  running: new Set(["dev"]),
  activeProfile: "",
  git: { branch: "main", upstream: true, ahead: 0, behind: 0, branches: [], changes: [] },
  files: {},
});

describe("applyConfigYaml", () => {
  it("replaces what the file leaves out and keeps the text as written", () => {
    const p = project();
    const yaml = "name: myapp\nservices:\n  web: npm run dev\n";
    applyConfigYaml(p, yaml);
    expect(p.services.map((s) => s.name)).toEqual(["web"]);
    expect(p.running.size).toBe(0);
    expect(configYaml(p)).toBe(yaml);
  });

  it("orders actions by position, then key, and folds in the terminals section", () => {
    const p = project();
    applyConfigYaml(
      p,
      "actions:\n  zeta: z\n  beta:\n    cmd: b\n    position: 2\n  alpha:\n    cmd: a\n    position: 1\n  gamma: g\nterminals:\n  claude: claude\n",
    );
    expect(p.actions.map((a) => a.name)).toEqual(["alpha", "beta", "gamma", "zeta", "claude"]);
    expect(p.actions.at(-1)?.type).toBe("terminal");
  });

  it("gives menu children their parent's type, folder and environment", () => {
    const p = project();
    applyConfigYaml(
      p,
      [
        "actions:",
        "  db:",
        "    label: Database",
        "    type: background",
        "    cwd: ./backend",
        "    env: { A: '1' }",
        "    primary: last-used",
        "    actions:",
        "      seed:",
        "        cmd: make seed",
        "        env: { B: '2' }",
        "      reset:",
        "        cmd: make reset",
        "        type: terminal",
        "        confirm: true",
      ].join("\n"),
    );
    const [db] = p.actions;
    expect(db.primary).toBe("last-used");
    expect(db.children?.map((c) => [c.name, c.type, c.cwd])).toEqual([
      ["reset", "terminal", "./backend"],
      ["seed", "background", "./backend"],
    ]);
    expect(db.children?.[1].env).toEqual({ A: "1", B: "2" });
    expect(db.children?.[0].confirm).toBe(true);
  });

  it("reads only the zones that declare rows, with their layers in order", () => {
    const p = project();
    applyConfigYaml(
      p,
      [
        "zones:",
        "  build:",
        "    rows: 2",
        "    display: footer",
        "    layers:",
        "      web: { position: 2 }",
        "      mobile: { label: Mobile, position: 1 }",
        "  note:",
        "    position: 3",
      ].join("\n"),
    );
    expect(p.zones).toEqual([
      {
        name: "build",
        label: "build",
        rows: 2,
        display: "footer",
        position: undefined,
        source: "project",
        layers: [
          { name: "mobile", label: "Mobile", position: 1 },
          { name: "web", label: undefined, position: 2 },
        ],
        collapsed: undefined,
      },
    ]);
  });

  it("keeps a service's output only while its command stays the same", () => {
    const p = project();
    applyConfigYaml(p, "services:\n  web:\n    cmd: npm run dev\n    port: 3000\n    dependsOn: [db]\n  db: postgres\n");
    const log = p.services[0].log;
    expect(log.map((l) => l.text)).toEqual(["$ npm run dev", "Listening on http://localhost:3000"]);
    expect(p.services[0].dependsOn).toEqual(["db"]);
    applyConfigYaml(p, "services:\n  web:\n    cmd: npm run dev\n    port: 3000\n");
    expect(p.services[0].log).toBe(log);
    applyConfigYaml(p, "services:\n  web: npm start\n");
    expect(p.services[0].log[0].text).toBe("$ npm start");
  });
});
