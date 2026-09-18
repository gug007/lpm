import { parentPath } from "./treeModel";

export type MarkdownTarget =
  | { kind: "external"; url: string }
  | { kind: "anchor" }
  | { kind: "file"; path: string };

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

// Where a link or image in a Markdown file points: out of the app, within the
// page, or at another project file — relative to the file's own folder, or to
// the project root when it starts with "/", the way GitHub reads them.
export function markdownTarget(filePath: string, href: string): MarkdownTarget {
  if (SCHEME_RE.test(href) || href.startsWith("//")) return { kind: "external", url: href };
  const end = href.search(/[#?]/);
  const target = decode(end < 0 ? href : href.slice(0, end));
  if (!target) return { kind: "anchor" };
  const base = target.startsWith("/") ? "" : parentPath(filePath);
  return { kind: "file", path: normalize(base ? `${base}/${target}` : target) };
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}
