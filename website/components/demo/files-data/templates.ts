// One template per language the demo's project trees contain. Each is written
// from the file's own path, so a folder of fourteen guides is not fourteen
// copies of one placeholder.
import { ancestorsOf, basename, parentPath } from "../files-model";
import { ACRONYMS, camel, pascal, snake, stem, titleCase, words } from "./path-words";

export function mdx(path: string): string {
  const title = titleCase(words(path));
  const noun = words(path).map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w)).join(" ");
  // The import has to climb out of content/ to reach the components folder.
  const up = "../".repeat(Math.max(1, ancestorsOf(path).length - 1));
  return `---
title: ${title}
description: How ${noun} works, and what you need to configure.
---

import Callout from "${up}components/Callout.astro";

${title} is handled for you in most projects. This page covers the cases where
it is not, and the settings that change the default.

<Callout type="note">
  Everything below assumes an API key with the \`read\` scope. See
  [Authentication](/docs/api/authentication) for how to create one.
</Callout>

## Getting started

Set the values you need in your project configuration, then restart the dev
server so the new settings are picked up.

\`\`\`bash
npx create-app config set ${snake(path)}.enabled true
\`\`\`

## What to watch for

Changes take effect on the next request. Cached responses keep the previous
behaviour until their TTL expires.
`;
}

export function go(path: string): string {
  const pkg = basename(parentPath(path)) || "main";
  const fn = pascal(path);
  return `package ${pkg}

import (
\t"context"
\t"fmt"
)

// ${fn} covers the ${words(path).join(" ")} half of the ${pkg} package.
type ${fn} struct {
\tstore Store
}

func New${fn}(store Store) *${fn} {
\treturn &${fn}{store: store}
}

func (h *${fn}) Handle(ctx context.Context, id string) error {
\tif id == "" {
\t\treturn fmt.Errorf("${pkg}: empty id")
\t}
\treturn h.store.Touch(ctx, id)
}
`;
}

export function python(path: string): string {
  const fn = snake(path);
  return `"""${titleCase(words(path))} step of the pipeline."""

from __future__ import annotations

import pandas as pd

from .config import Config


def ${fn}(df: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    out = df.copy()
    out = out[out["amount"].notna()]
    out["${fn}_ok"] = out["amount"] > 0
    return out.reset_index(drop=True)
`;
}

export function pytest(path: string): string {
  const target = snake(path).replace(/^test_/, "");
  return `import pandas as pd

from pipeline.${target} import ${target}
from pipeline.config import Config


def test_${target}_keeps_valid_rows():
    df = pd.DataFrame({"amount": [1.0, None, 3.0]})
    out = ${target}(df, Config())
    assert len(out) == 2


def test_${target}_is_idempotent():
    df = pd.DataFrame({"amount": [1.0, 2.0]})
    once = ${target}(df, Config())
    twice = ${target}(once, Config())
    assert once.equals(twice)
`;
}

export function goTest(path: string): string {
  const pkg = basename(parentPath(path)) || "main";
  const subject = pascal(path).replace(/Test$/, "");
  return `package ${pkg}

import "testing"

func Test${subject}(t *testing.T) {
	t.Parallel()

	if got := ${camel(path).replace(/Test$/, "")}(); got == nil {
		t.Fatalf("${camel(path).replace(/Test$/, "")}() = nil, want a value")
	}
}

func Test${subject}Rejects(t *testing.T) {
	t.Parallel()

	if err := validate(""); err == nil {
		t.Fatal("validate(\"\") = nil, want an error")
	}
}
`;
}

export function jsTest(path: string): string {
  // Both projects that carry tests run them with globals on — vitest.config.ts
  // in one, jest-expo's preset in the other — so nothing is imported here.
  if (path.endsWith(".tsx")) {
    const name = pascal(path).replace(/Test$/, "");
    return `import { ${name} } from "./${stem(path)}";

describe("${name}", () => {
  it("is exported as a component", () => {
    expect(typeof ${name}).toBe("function");
  });

  it("takes a single props argument", () => {
    expect(${name}.length).toBe(1);
  });

  it("renders with the props it documents", () => {
    expect(() => ${name}({ title: "Continue" })).not.toThrow();
  });
});
`;
  }
  const subject = camel(path).replace(/Test$/, "");
  return `import { ${subject} } from "./${stem(path)}";

describe("${subject}", () => {
  it("returns a value for a known input", () => {
    expect(${subject}("ok")).toBeDefined();
  });

  it("throws on an empty input", () => {
    expect(() => ${subject}("")).toThrow();
  });

  it("is stable across calls", () => {
    expect(${subject}("ok")).toEqual(${subject}("ok"));
  });
});
`;
}

export function tsx(path: string): string {
  const name = pascal(path);
  return `import { StyleSheet, Text, View } from "react-native";

type Props = {
  title: string;
};

export function ${name}({ title }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 16, fontWeight: "600" },
});
`;
}

export function ts(path: string): string {
  const fn = camel(path);
  return `import { API } from "./api";

export type ${pascal(path)}Options = {
  signal?: AbortSignal;
};

export async function ${fn}(id: string, opts: ${pascal(path)}Options = {}) {
  const res = await fetch(\`\${API}/v1/${words(path).join("-")}/\${id}\`, opts);
  if (!res.ok) throw new Error(\`${fn} failed: \${res.status}\`);
  return res.json();
}
`;
}

export function ruby(path: string): string {
  const name = pascal(path);
  return `# frozen_string_literal: true

class ${name} < ApplicationRecord
  validates :name, presence: true

  scope :active, -> { where(archived_at: nil) }

  def to_api
    { id: id, name: name }
  end
end
`;
}

export function sql(path: string): string {
  const table = snake(path).replace(/^(create|add|drop|backfill)_/, "");
  const verb = words(path)[0];
  if (verb === "add") {
    return `ALTER TABLE ${table.split("_")[0]}s
  ADD COLUMN ${table} text;

CREATE INDEX IF NOT EXISTS idx_${table} ON ${table.split("_")[0]}s (${table});
`;
  }
  return `CREATE TABLE IF NOT EXISTS ${table} (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;
}

export function astro(path: string): string {
  return `---
interface Props {
  title?: string;
}

const { title } = Astro.props;
---

<section class="${stem(path).toLowerCase()}">
  {title && <h2>{title}</h2>}
  <slot />
</section>
`;
}

export function yaml(path: string): string {
  const key = words(path).join("-");
  return `# ${titleCase(words(path))}
${key}:
  enabled: true
  concurrency: 5
  retry:
    attempts: 3
    backoff: 2s
`;
}

export function json(path: string): string {
  return `{
  "name": "${stem(path)}",
  "version": "1.0.0",
  "generated": false
}
`;
}

export function css(): string {
  return `:root {
  --bg: #ffffff;
  --fg: #111827;
  --accent: #2563eb;
  --radius: 12px;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-sans-serif, system-ui, sans-serif;
  line-height: 1.6;
}

a {
  color: var(--accent);
}
`;
}

export function xml(path: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<${stem(path).toLowerCase()}>
  <key>CFBundleName</key>
  <string>mobileapp</string>
  <key>CFBundleShortVersionString</key>
  <string>1.4.0</string>
</${stem(path).toLowerCase()}>
`;
}

export function csv(path: string): string {
  return `event_id,user_id,amount,ts,label
9f21,u_1044,42.10,2026-${stem(path).slice(-2)}-01T09:12:04Z,0
9f22,u_2087,18.00,2026-${stem(path).slice(-2)}-01T09:12:51Z,0
9f23,u_1044,1204.55,2026-${stem(path).slice(-2)}-01T09:13:18Z,1
9f24,u_3310,7.99,2026-${stem(path).slice(-2)}-01T09:14:02Z,0
`;
}

export function shell(path: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

# ${titleCase(words(path))}
exec "$(dirname "$0")/../node_modules/.bin/${stem(path)}" "$@"
`;
}

export function lockfile(path: string): string {
  if (path.endsWith("Gemfile.lock")) {
    return `GEM
  remote: https://rubygems.org/
  specs:
    pg (1.5.6)
    puma (6.4.2)
      nio4r (~> 2.0)
    rails (7.1.3.4)
    sidekiq (7.2.4)

PLATFORMS
  arm64-darwin-23
  x86_64-linux

DEPENDENCIES
  pg (~> 1.5)
  puma (~> 6.4)
  rails (~> 7.1.3)
  sidekiq (~> 7.2)

BUNDLED WITH
   2.5.11
`;
  }
  return `lockfileVersion: "9.0"

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:
  .:
    dependencies: {}
`;
}

export function ignore(): string {
  return `node_modules/
dist/
.next/
/bin/
*.log
.env
.DS_Store
`;
}
