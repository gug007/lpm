// Selecting terminal text on a phone, where a drag always scrolls: hold a line
// to select it (a drag after the hold widens the selection), move either end by
// its handle, then Copy, Add to prompt, Find or select All from the bar over it.
// The page posts `selection` with { action, text }; the app does the rest.
(function () {
  const STYLE = `
    .lpm-sel-handle { position: fixed; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px;
      display: none; touch-action: none; -webkit-user-select: none; user-select: none; z-index: 10; }
    .lpm-sel-handle i { position: absolute; left: 21px; width: 2px; background: #0a84ff; }
    .lpm-sel-handle b { position: absolute; left: 16px; width: 12px; height: 12px; border-radius: 6px; background: #0a84ff; }
    .lpm-sel-bar { position: fixed; left: 0; top: 0; display: none; z-index: 11; border-radius: 14px;
      background: #3a3a3c; box-shadow: 0 8px 24px rgba(0,0,0,.45); overflow: hidden;
      font: 15px -apple-system, system-ui, sans-serif; -webkit-user-select: none; user-select: none; }
    .lpm-sel-bar button { appearance: none; border: 0; margin: 0; background: none; color: #f2f2f7; font: inherit;
      min-height: 44px; padding: 0 14px; touch-action: manipulation; }
    .lpm-sel-bar button + button { border-left: 1px solid #545458; }
    .lpm-sel-bar button.prompt { color: #ffb37a; }
    .lpm-sel-bar button:active { background: #48484a; }
  `;

  function create(term, post) {
    let sel = null;
    let anchor = null;
    let copiedTimer = 0;

    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    const handle = (side) => {
      const el = document.createElement('div');
      el.className = 'lpm-sel-handle';
      el.setAttribute('aria-hidden', 'true');
      el.dataset.side = side;
      el.append(document.createElement('i'), document.createElement('b'));
      document.body.appendChild(el);
      return el;
    };
    const startHandle = handle('start');
    const endHandle = handle('end');

    const bar = document.createElement('div');
    bar.className = 'lpm-sel-bar';
    bar.setAttribute('role', 'toolbar');
    const actions = [
      ['copy', 'Copy'],
      ['prompt', 'Add to prompt'],
      ['find', 'Find'],
      ['all', 'All'],
    ];
    const buttons = {};
    for (const [action, label] of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = action;
      b.textContent = label;
      b.addEventListener('click', (e) => { e.preventDefault(); run(action); });
      buttons[action] = b;
      bar.appendChild(b);
    }
    document.body.appendChild(bar);

    const geometry = () => {
      const screen = term.element && term.element.querySelector('.xterm-screen');
      if (!screen) return null;
      const r = screen.getBoundingClientRect();
      return { r, cw: r.width / term.cols, ch: r.height / term.rows };
    };

    const cellAt = (x, y) => {
      const g = geometry();
      if (!g) return null;
      const col = Math.max(0, Math.min(term.cols - 1, Math.floor((x - g.r.left) / g.cw)));
      const row = Math.max(0, Math.min(term.rows - 1, Math.floor((y - g.r.top) / g.ch)));
      return { x: col, y: term.buffer.active.viewportY + row };
    };

    const before = (p, q) => p.y < q.y || (p.y === q.y && p.x < q.x);

    // The first and last cells with something drawn in them, or null.
    const inked = (line) => {
      const cell = term.buffer.active.getNullCell();
      let first = -1, last = -1;
      for (let c = 0; c < line.length; c++) {
        if (!line.getCell(c, cell)) continue;
        const ch = cell.getChars();
        if (ch && ch.trim()) {
          if (first < 0) first = c;
          last = c + Math.max(1, cell.getWidth()) - 1;
        }
      }
      return first < 0 ? null : { first, last };
    };

    // The whole line under row y, following xterm's soft wraps both ways.
    const lineAt = (y) => {
      const buf = term.buffer.active;
      let top = y, bottom = y;
      while (top > 0 && buf.getLine(top) && buf.getLine(top).isWrapped) top--;
      while (buf.getLine(bottom + 1) && buf.getLine(bottom + 1).isWrapped) bottom++;
      let head = null, tail = null;
      for (let row = top; row <= bottom && !head; row++) {
        const ends = inked(buf.getLine(row));
        if (ends) head = { x: ends.first, y: row };
      }
      for (let row = bottom; row >= top && !tail; row--) {
        const ends = inked(buf.getLine(row));
        if (ends) tail = { x: ends.last, y: row };
      }
      return head && tail ? { start: head, end: tail } : null;
    };

    let applying = false;

    const apply = () => {
      const { start, end } = sel;
      const length = (end.y - start.y) * term.cols + (end.x - start.x) + 1;
      applying = true;
      term.select(start.x, start.y, length);
      applying = false;
      place();
    };

    const show = (on) => {
      const display = on ? 'block' : 'none';
      startHandle.style.display = display;
      endHandle.style.display = display;
      bar.style.display = on ? 'flex' : 'none';
    };

    // A knob above the first character or below the last, on a stem the height
    // of the row, centred in a 44 pt touch target.
    const placeHandle = (el, p, g, after) => {
      const row = p.y - term.buffer.active.viewportY;
      if (row < 0 || row >= term.rows) { el.style.display = 'none'; return null; }
      el.style.display = 'block';
      const x = g.r.left + (after ? p.x + 1 : p.x) * g.cw;
      const top = g.r.top + row * g.ch;
      const knobY = after ? top + g.ch + 4 : top - 4;
      const stem = el.firstChild;
      stem.style.height = g.ch + 4 + 'px';
      stem.style.top = after ? 22 - (g.ch + 4) + 'px' : '22px';
      el.lastChild.style.top = '16px';
      el.style.transform = `translate(${x}px, ${knobY}px)`;
      return { x, top, bottom: top + g.ch };
    };

    const place = () => {
      if (!sel) return;
      const g = geometry();
      if (!g) return;
      const a = placeHandle(startHandle, sel.start, g, false);
      const b = placeHandle(endHandle, sel.end, g, true);
      bar.style.display = 'flex';
      const w = bar.offsetWidth, h = bar.offsetHeight;
      const minTop = g.r.top + 6, maxTop = g.r.bottom - h - 6;
      let top;
      if (a && a.top - h - 18 >= minTop) top = a.top - h - 18;
      else if (b && b.bottom + 22 <= maxTop) top = b.bottom + 22;
      else top = a ? Math.max(minTop, Math.min(maxTop, a.top - h - 18)) : minTop;
      const mid = a && b ? (a.x + b.x) / 2 : a ? a.x : b ? b.x : g.r.left + g.r.width / 2;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, mid - w / 2));
      bar.style.transform = `translate(${left}px, ${Math.max(minTop, top)}px)`;
    };

    const clear = () => {
      if (!sel) return;
      sel = null;
      anchor = null;
      clearTimeout(copiedTimer);
      buttons.copy.textContent = 'Copy';
      show(false);
      applying = true;
      term.clearSelection();
      applying = false;
    };

    // Select the line under (x, y). False when the row holds nothing to select.
    const begin = (x, y) => {
      const c = cellAt(x, y);
      const line = c && lineAt(c.y);
      if (!line) return false;
      sel = { start: line.start, end: line.end };
      anchor = { start: line.start, end: line.end };
      show(true);
      apply();
      post('selection', { action: 'began' });
      return true;
    };

    const isWordCell = (line, x, cell) => {
      if (!line || x < 0 || x >= line.length || !line.getCell(x, cell)) return false;
      const ch = cell.getChars();
      return !!ch && /\S/.test(ch);
    };

    // The word around a cell, from its first character or to its last.
    const wordEdge = (p, toEnd) => {
      const line = term.buffer.active.getLine(p.y);
      const cell = term.buffer.active.getNullCell();
      if (!isWordCell(line, p.x, cell)) return p;
      let x = p.x;
      const step = toEnd ? 1 : -1;
      while (isWordCell(line, x + step, cell)) x += step;
      return { x, y: p.y };
    };

    // The finger that made the selection kept moving: widen it to the word under
    // the finger, never smaller than the line it started on.
    const extendTo = (x, y) => {
      if (!sel || !anchor) return;
      const c = cellAt(x, y);
      if (!c) return;
      sel = before(c, anchor.start) ? { start: wordEdge(c, false), end: anchor.end }
        : before(anchor.end, c) ? { start: anchor.start, end: wordEdge(c, true) }
        : { start: anchor.start, end: anchor.end };
      apply();
    };

    const text = () => (term.hasSelection() ? term.getSelection() : '');

    const run = (action) => {
      if (!sel) return;
      if (action === 'all') {
        const buf = term.buffer.active;
        sel = { start: { x: 0, y: 0 }, end: { x: term.cols - 1, y: Math.max(0, buf.length - 1) } };
        anchor = null;
        applying = true;
        term.selectAll();
        applying = false;
        place();
        return;
      }
      const selected = text();
      if (!selected.trim()) { clear(); return; }
      if (action === 'copy') {
        post('selection', { action, text: selected });
        buttons.copy.textContent = 'Copied';
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(clear, 650);
        return;
      }
      const sent = action === 'find'
        ? selected.split('\n').map((l) => l.trim()).find((l) => l) || ''
        : selected;
      clear();
      post('selection', { action, text: sent });
    };

    // Dragging a handle moves that end; crossing the other end swaps them.
    const drag = (el, side) => {
      let active = false;
      el.addEventListener('touchstart', (e) => {
        if (!sel) return;
        active = true;
        anchor = null;
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });
      el.addEventListener('touchmove', (e) => {
        if (!active || !sel || e.touches.length !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.touches[0];
        // Aim at the row the knob marks, not at the finger just above or below it.
        const g = geometry();
        const toRow = g ? g.ch / 2 + 4 : 0;
        const c = cellAt(t.clientX, t.clientY + (side === 'start' ? toRow : -toRow));
        if (!c) return;
        if (side === 'start') {
          sel.start = c;
          if (before(sel.end, sel.start)) { sel = { start: sel.end, end: c }; side = 'end'; }
        } else {
          sel.end = c;
          if (before(sel.end, sel.start)) { sel = { start: c, end: sel.start }; side = 'start'; }
        }
        apply();
      }, { passive: false });
      const done = (e) => {
        if (!active) return;
        active = false;
        side = el.dataset.side;
        e.preventDefault();
        e.stopPropagation();
      };
      el.addEventListener('touchend', done, { passive: false });
      el.addEventListener('touchcancel', done, { passive: false });
    };
    drag(startHandle, 'start');
    drag(endHandle, 'end');

    term.onScroll(place);
    term.onResize(() => clear());
    term.onSelectionChange(() => {
      if (!applying && sel && !term.hasSelection()) clear();
    });
    window.addEventListener('resize', place);

    return {
      begin,
      extendTo,
      clear,
      get active() { return sel !== null; },
    };
  }

  const api = { create };
  if (typeof window !== 'undefined') window.LpmSelect = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
