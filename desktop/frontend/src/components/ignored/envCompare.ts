function parseEnv(text: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return out;
}

/// A value with its middle hidden: enough to tell two keys apart, never
/// enough to use one.
export function mask(value: string): string {
  const v = value.replace(/^(['"])(.*)\1$/, "$2");
  if (v.length <= 10) return "••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

export type KeyResult = "Same" | "Changed" | "Added" | "Removed";

export interface KeyRow {
  key: string;
  // Each file's value, in the order the files were given.
  values: (string | undefined)[];
  result: KeyResult;
}

/// Each key any of the files has, and what keeping file `kept` everywhere does
/// to it on the others.
export function compareEnv(texts: (string | null)[], kept: number): KeyRow[] {
  const maps = texts.map(parseEnv);
  const keys = [...new Set(maps.flatMap((m) => [...m.keys()]))];
  return keys.map((key) => {
    const values = maps.map((m) => m.get(key));
    const winner = values[kept];
    const others = values.filter((_, i) => i !== kept);
    const result: KeyResult =
      winner === undefined
        ? "Removed"
        : others.some((v) => v !== undefined && v !== winner)
          ? "Changed"
          : others.some((v) => v === undefined)
            ? "Added"
            : "Same";
    return { key, values, result };
  });
}
