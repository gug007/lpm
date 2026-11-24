// The terminal's last lines as the escape codes that draw them again, for reading a
// tab while the Mac is away: text, colors and styles, without the scrollback before
// them. Lines that wrapped stay one line, so they reflow at another width.
const LpmSnapshot = (() => {
  // One cell's colors and styles as SGR parameters, '' for plain text.
  const sgr = c => {
    if (c.isAttributeDefault()) return '';
    const on = [];
    if (c.isBold()) on.push(1);
    if (c.isDim()) on.push(2);
    if (c.isItalic()) on.push(3);
    if (c.isUnderline()) on.push(4);
    if (c.isInverse()) on.push(7);
    if (c.isInvisible()) on.push(8);
    if (c.isStrikethrough()) on.push(9);
    if (c.isOverline()) on.push(53);
    const color = (base, rgb, palette, value) => {
      if (rgb) on.push(base + 8, 2, (value >> 16) & 255, (value >> 8) & 255, value & 255);
      else if (palette && value < 8) on.push(base + value);
      else if (palette && value < 16) on.push(base + 60 + value - 8);
      else if (palette) on.push(base + 8, 5, value);
    };
    color(30, c.isFgRGB(), c.isFgPalette(), c.getFgColor());
    color(40, c.isBgRGB(), c.isBgPalette(), c.getBgColor());
    return on.join(';');
  };

  // A cell that draws nothing: no character and the terminal's own background.
  const blank = c => c.getChars().trim() === '' && c.isBgDefault() && !c.isInverse()
    && !c.isUnderline() && !c.isStrikethrough() && !c.isOverline();

  const line = (row, cols, whole, cell) => {
    let end = Math.min(cols, row.length);
    if (!whole) while (end > 0 && blank(row.getCell(end - 1, cell))) end--;
    let out = '', style = '';
    for (let x = 0; x < end; x++) {
      const c = row.getCell(x, cell);
      if (c.getWidth() === 0) continue; // the second half of a wide character
      const next = sgr(c);
      if (next !== style) {
        out += next ? '\x1b[0;' + next + 'm' : '\x1b[0m';
        style = next;
      }
      out += c.getChars() || ' ';
    }
    return style ? out + '\x1b[0m' : out;
  };

  const take = (term, count) => {
    const buf = term.buffer.active;
    let last = buf.length - 1;
    const cell = buf.getNullCell();
    const empty = y => {
      const row = buf.getLine(y);
      if (!row) return true;
      for (let x = 0; x < row.length; x++) if (!blank(row.getCell(x, cell))) return false;
      return true;
    };
    while (last >= 0 && empty(last)) last--;
    if (last < 0) return '';
    let first = Math.max(0, last + 1 - count);
    // Not from the middle of a line that wrapped.
    while (first > 0 && buf.getLine(first).isWrapped) first--;
    let out = '';
    for (let y = first; y <= last; y++) {
      const next = y < last ? buf.getLine(y + 1) : null;
      const wraps = !!next && next.isWrapped;
      out += line(buf.getLine(y), term.cols, wraps, cell);
      if (y < last && !wraps) out += '\r\n';
    }
    return out + '\x1b[?25l';
  };

  // As many of the last `lines` lines as fit in `max` characters.
  return {
    take: (term, lines, max) => {
      for (let count = lines; count > 0; count = Math.floor(count / 2)) {
        const out = take(term, count);
        if (out.length <= max) return out;
      }
      return '';
    },
  };
})();
