// Tapping a file path in the terminal opens it in the preview sheet, like a
// click in the desktop terminal. PATH_RE and the cell mapping mirror the
// desktop's pathLinkProvider.ts (its tests run this copy too): at least one
// separator and a whole extension, optionally followed by :line[:col],
// (line[,col]) or #Lline[Ccol].
//
// One addition: agent TUIs like Claude Code wrap text themselves, so a long path
// breaks across rows xterm never marks as wrapped. A second reading rejoins rows
// that run into the right edge (dropping the next row's indent). Both readings
// go to the Mac, which opens the first one that exists.
(function () {
  const SEG = String.raw`(?:[\w.@+-]|\[{1,2}[\w.-]+\]{1,2}|\([\w.-]+\))`;
  const PATH_RE = new RegExp(
    String.raw`(?<![\w./~-])(?<!:(?=[\d/]))(?:file:\/\/(?=\/))?` +
      String.raw`((?:~\/|\.{1,2}\/|\/|(?![@+])${SEG}+\/)(?:${SEG}|\/)*\.[a-zA-Z]\w{0,9})(?![\w/])` +
      String.raw`(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s?(\d+))?\)|#L(\d+)(?:C(\d+))?(?:-L?\d+)?)?`,
    'g',
  );
  const PATH_CHAR = /[\w./~@+()[\]-]/;
  const MAX_ROWS = 64;
  const MAX_CHARS = 2048;
  // How close to the right edge a row must end to read as cut off there.
  const EDGE_SLACK = 4;

  // One row's characters and the cells they sit in (a wide glyph is one char
  // over two cells), trailing blanks dropped.
  function readRow(line, cell) {
    const row = { text: '', x: [], w: [] };
    for (let col = 0; col < line.length; col++) {
      if (!line.getCell(col, cell)) continue;
      const w = cell.getWidth();
      if (w === 0) continue;
      const chars = cell.getChars() || ' ';
      for (let i = 0; i < chars.length; i++) {
        row.x.push(col);
        row.w.push(w);
      }
      row.text += chars;
    }
    let end = row.text.length;
    while (end > 0 && row.text[end - 1] === ' ') end--;
    row.text = row.text.slice(0, end);
    row.x.length = end;
    row.w.length = end;
    return row;
  }

  function readingOf(buf, cols, index, rejoin) {
    const cell = buf.getNullCell();
    const rows = new Map();
    const rowAt = y => {
      if (!rows.has(y)) {
        const line = buf.getLine(y);
        rows.set(y, line ? readRow(line, cell) : null);
      }
      return rows.get(y);
    };
    // Whether row y + 1 carries on row y.
    const continues = y => {
      const next = buf.getLine(y + 1);
      if (!next) return false;
      if (next.isWrapped) return true;
      if (!rejoin) return false;
      const a = rowAt(y), b = rowAt(y + 1);
      if (!a || !b || !a.text) return false;
      const lastCol = a.x[a.x.length - 1] + a.w[a.w.length - 1];
      const head = b.text.trimStart();
      return lastCol >= cols - EDGE_SLACK
        && PATH_CHAR.test(a.text[a.text.length - 1])
        && head.length > 0 && PATH_CHAR.test(head[0]);
    };

    const win = { text: '', x: [], y: [], w: [] };
    if (!buf.getLine(index)) return win;
    let top = index;
    while (top > 0 && index - top < MAX_ROWS && continues(top - 1)) top--;
    for (let y = top; y - top < MAX_ROWS; y++) {
      const row = rowAt(y);
      if (!row) break;
      const soft = y === top || buf.getLine(y).isWrapped;
      const skip = soft ? 0 : row.text.length - row.text.trimStart().length;
      win.text += row.text.slice(skip);
      for (let i = skip; i < row.text.length; i++) {
        win.x.push(row.x[i]);
        win.y.push(y);
        win.w.push(row.w[i]);
      }
      if (win.text.length >= MAX_CHARS || !continues(y)) break;
    }
    return win;
  }

  // The path in `win` drawn over cell (col, y), within a cell of the finger.
  function matchAt(win, col, y) {
    let hit = -1, best = 2;
    for (let i = 0; i < win.text.length; i++) {
      if (win.y[i] !== y) continue;
      const d = col < win.x[i] ? win.x[i] - col : Math.max(0, col - (win.x[i] + win.w[i] - 1));
      if (d < best) { best = d; hit = i; }
    }
    if (hit < 0) return null;
    PATH_RE.lastIndex = 0;
    let m;
    while ((m = PATH_RE.exec(win.text)) !== null) {
      const start = m.index, last = m.index + m[0].length - 1;
      if (hit < start || hit > last) continue;
      return {
        path: m[1],
        line: parseInt(m[2] || m[4] || m[6] || '0', 10),
        start: { x: win.x[start], y: win.y[start] },
        end: { x: win.x[last] + win.w[last] - 1, y: win.y[last] },
      };
    }
    return null;
  }

  // Every reading of the path under buffer cell (col, index), longest first.
  function pathsAt(buf, cols, index, col) {
    const joined = matchAt(readingOf(buf, cols, index, true), col, index);
    const plain = matchAt(readingOf(buf, cols, index, false), col, index);
    const out = [];
    for (const m of [joined, plain]) {
      if (m && !out.some(o => o.path === m.path)) out.push(m);
    }
    return out;
  }

  // Map a touch point to a buffer cell and read the paths there.
  function pathsAtPoint(term, clientX, clientY) {
    const screen = term.element && term.element.querySelector('.xterm-screen');
    if (!screen) return [];
    const r = screen.getBoundingClientRect();
    const col = Math.floor((clientX - r.left) / (r.width / term.cols));
    const row = Math.floor((clientY - r.top) / (r.height / term.rows));
    if (col < 0 || row < 0 || col >= term.cols || row >= term.rows) return [];
    const buf = term.buffer.active;
    return pathsAt(buf, term.cols, buf.viewportY + row, col);
  }

  // Briefly select the tapped path, so the tap reads as having hit it.
  function flash(term, m) {
    const length = (m.end.y - m.start.y) * term.cols + (m.end.x - m.start.x) + 1;
    try {
      term.select(m.start.x, m.start.y, length);
      setTimeout(() => term.clearSelection(), 350);
    } catch (e) {}
  }

  const api = { pathsAt, pathsAtPoint, flash };
  if (typeof window !== 'undefined') window.LpmPathTap = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
