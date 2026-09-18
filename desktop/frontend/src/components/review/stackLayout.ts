// The geometry of a stack of rows: each row's height and, from those, where
// every row sits. Heights arrive as rows are measured; the offsets are prefix
// sums rebuilt lazily from the first stale row, so a run of height changes
// costs one pass. Nothing here reads the DOM, which is what lets the stack
// find the rows in view, the row under the viewport top, and the scroll
// correction for a row growing above it, without forcing a layout.
export class StackLayout {
  private paths: string[] = [];
  private index = new Map<string, number>();
  private heights: number[] = [];
  private offsets: number[] = [0];
  private staleFrom = 0;

  constructor(private readonly defaultHeight: number) {}

  get length(): number {
    return this.paths.length;
  }

  // A new row order; rows carry their height across, new ones start at the
  // default until measured.
  setRows(paths: readonly string[]): void {
    const heights = paths.map((path) => {
      const i = this.index.get(path);
      return i === undefined ? this.defaultHeight : this.heights[i];
    });
    this.paths = [...paths];
    this.index = new Map(paths.map((path, i) => [path, i]));
    this.heights = heights;
    this.offsets.length = paths.length + 1;
    this.staleFrom = 0;
  }

  indexOf(path: string): number {
    return this.index.get(path) ?? -1;
  }

  height(i: number): number {
    return this.heights[i];
  }

  // Records a measured height; the change in it, which is what rows below
  // shift by.
  setHeight(path: string, height: number): number {
    const i = this.index.get(path);
    if (i === undefined) return 0;
    const delta = height - this.heights[i];
    if (delta === 0) return 0;
    this.heights[i] = height;
    this.staleFrom = Math.min(this.staleFrom, i);
    return delta;
  }

  top(i: number): number {
    this.settle();
    return this.offsets[Math.max(0, Math.min(i, this.paths.length))];
  }

  total(): number {
    return this.top(this.paths.length);
  }

  // The row whose extent holds `y`: the last one starting at or above it.
  indexAt(y: number): number {
    this.settle();
    if (this.paths.length === 0) return -1;
    let lo = 0;
    let hi = this.paths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // The rows overlapping [from, to), as an inclusive index range, or null.
  range(from: number, to: number): [number, number] | null {
    if (this.paths.length === 0 || to <= from) return null;
    const first = this.indexAt(Math.max(0, from));
    const last = this.indexAt(Math.max(0, to - 1));
    return first <= last ? [first, last] : null;
  }

  private settle(): void {
    const n = this.paths.length;
    for (let i = this.staleFrom; i < n; i++) {
      this.offsets[i + 1] = this.offsets[i] + this.heights[i];
    }
    this.staleFrom = n;
  }
}
