// What browser_pick.rs hands back for a pick on a browser tab's page.
export interface BrowserPickComponent {
  framework: string;
  names: string[];
  file: string | null;
  line: number | null;
}

export interface BrowserPick {
  kind: "element" | "area";
  url: string;
  title: string;
  tag: string | null;
  selector: string | null;
  text: string | null;
  html: string | null;
  component: BrowserPickComponent | null;
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
  // Base64 PNG of the picked rect, when the engine could take one.
  image: string | null;
}

export const PICK_IMAGE_TOKEN = "[Image #1]";

function componentLine(c: BrowserPickComponent): string | null {
  const [name, ...owners] = c.names;
  const where = c.file ? `${c.file}${c.line ? `:${c.line}` : ""}` : "";
  if (!name && !where) return null;
  const who = name ? `${[name, ...owners].join(" in ")} (${c.framework})` : c.framework;
  return where ? `${who}, ${where}` : who;
}

function boxLine(pick: BrowserPick): string {
  const { rect: r, viewport: v } = pick;
  return `${Math.round(r.width)}×${Math.round(r.height)} at (${Math.round(r.x)}, ${Math.round(r.y)}) in a ${Math.round(v.width)}×${Math.round(v.height)} viewport`;
}

/** The pick as a block for the agent's input, ending on a blank line so what
 *  is typed next reads as the request about it. `withImage` leads with the
 *  token its picture is attached under. */
export function pickPromptText(pick: BrowserPick, withImage: boolean): string {
  const lines: string[] = [];
  if (withImage) lines.push(PICK_IMAGE_TOKEN);
  const component = pick.component ? componentLine(pick.component) : null;
  if (pick.kind === "area") {
    lines.push(`Area picked in the browser on ${pick.url}`);
    lines.push(`- Box: ${boxLine(pick)}`);
    if (pick.selector) lines.push(`- Around: ${pick.selector}`);
    if (component) lines.push(`- Component: ${component}`);
  } else {
    lines.push(`Element picked in the browser on ${pick.url}`);
    const tag = pick.html ?? (pick.tag ? `<${pick.tag}>` : null);
    if (tag) lines.push(`- Element: ${tag}${pick.text ? ` "${pick.text}"` : ""}`);
    if (pick.selector) lines.push(`- Selector: ${pick.selector}`);
    if (component) lines.push(`- Component: ${component}`);
    lines.push(`- Box: ${boxLine(pick)}`);
  }
  return `${lines.join("\n")}\n\n`;
}
