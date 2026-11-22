// What a mini view shows of a terminal's screen: its last `max` lines of output,
// one blank kept between paragraphs. An agent's input box, status line and the
// rules around them sit at the bottom of its screen, so the screen is cut at the
// first rule or box edge near the bottom, and only what is above it counts.
const RULE = /^\s*[╭╰┌└├╞]?[─━═╌┄┈]{6,}[╮╯┐┘┤╡]?\s*$/;

// How far up from the bottom the input area can reach.
const CHROME_ROWS = 10;

export function miniViewLines(screen: readonly string[], max: number): string[] {
  let end = screen.length;
  while (end > 0 && !screen[end - 1].trim()) end--;
  const limit = Math.max(0, end - CHROME_ROWS);
  let cut = end;
  for (let i = end - 1; i >= limit; i--) {
    if (RULE.test(screen[i])) cut = i;
  }
  const lines: string[] = [];
  let shown = 0;
  for (let i = cut - 1; i >= 0 && shown < max; i--) {
    const line = screen[i].replace(/\s+$/, "");
    if (!line.trim()) {
      if (lines.length > 0 && lines[0] !== "") lines.unshift("");
      continue;
    }
    lines.unshift(line);
    shown++;
  }
  while (lines[0] === "") lines.shift();
  return lines;
}
