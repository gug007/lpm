// How a hand moves and types. The tour's cursor and composer both read from
// here, seeded by what they are doing, so every visit gets the same rhythm and
// the tour's clock can add it up in advance.

export type Point = { x: number; y: number };

// mulberry32 over a small string hash: enough spread for jitter, and the same
// sequence for the same seed on every visit.
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The velocity profile of a reaching movement: still at both ends, fastest in
// the middle, with no kink anywhere.
function minimumJerk(u: number): number {
  return u * u * u * (10 + u * (-15 + 6 * u));
}

// A reach is really two movements: a fast one that lands a little past the
// target, and a short correction back onto it.
const PRIMARY_SHARE = 0.8;

function travelProgress(u: number, overshoot: number): number {
  if (u < PRIMARY_SHARE)
    return (1 + overshoot) * minimumJerk(u / PRIMARY_SHARE);
  const back = (u - PRIMARY_SHARE) / (1 - PRIMARY_SHARE);
  return 1 + overshoot * (1 - minimumJerk(back));
}

// A quadratic curve bowed to one side of the straight line — the one route a
// hand never takes. Extends past the end for the overshoot.
function travelPath(from: Point, to: Point, seed: string): (t: number) => Point {
  const rng = seededRandom(seed);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const bend =
    Math.min(dist * (0.08 + rng() * 0.1), 56) * (rng() < 0.5 ? -1 : 1);
  const nx = dist ? -dy / dist : 0;
  const ny = dist ? dx / dist : 0;
  const cx = from.x + dx / 2 + nx * bend;
  const cy = from.y + dy / 2 + ny * bend;
  return (t) => {
    const s = 1 - t;
    return {
      x: s * s * from.x + 2 * s * t * cx + t * t * to.x,
      y: s * s * from.y + 2 * s * t * cy + t * t * to.y,
    };
  };
}

const PATH_SAMPLES = 40;

// The frames of one reach, sampled evenly in time so the easing lives in the
// spacing and the animation itself can run linear.
export function travelKeyframes(
  from: Point,
  to: Point,
  seed: string,
): Keyframe[] {
  const path = travelPath(from, to, seed);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const overshoot = dist ? Math.min(0.03, 10 / dist) : 0;
  return Array.from({ length: PATH_SAMPLES + 1 }, (_, i) => {
    const u = i / PATH_SAMPLES;
    const p = path(travelProgress(u, overshoot));
    return {
      transform: `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`,
      offset: u,
    };
  });
}

// Longer reaches take longer, but not proportionally — and never so long that
// the cursor is still moving when the click it is heading for lands.
export function travelDurationMs(dist: number, budgetMs: number): number {
  const natural = Math.min(1100, Math.max(320, 240 + dist * 0.85));
  return Math.max(200, Math.min(natural, budgetMs - 140));
}

export type TypingSchedule = {
  // How long before each character appears; the first one carries the pause
  // while the field takes focus.
  delays: number[];
  // The beat between the last character and the prompt going.
  sendMs: number;
};

// A typist, not a metronome: quick spaces, a breath at each new word, a longer
// one every few words, and a reach for digits and capitals.
export function typingSchedule(text: string): TypingSchedule {
  const rng = seededRandom(`type:${text}`);
  const delays: number[] = [];
  let wordsUntilPause = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : " ";
    let ms = i === 0 ? 260 + rng() * 160 : 44 + rng() * 40;
    if (ch === " ") ms = 36 + rng() * 30;
    if (i > 0 && prev === " ") {
      ms += 50 + rng() * 70;
      wordsUntilPause -= 1;
      if (wordsUntilPause <= 0) {
        ms += 220 + rng() * 200;
        wordsUntilPause = 3 + Math.floor(rng() * 3);
      }
    }
    if (ch >= "0" && ch <= "9") ms += 20 + rng() * 20;
    if (ch !== ch.toLowerCase()) ms += 25;
    if (",.;:-".includes(prev)) ms += 60;
    delays.push(Math.round(ms));
  }
  return { delays, sendMs: Math.round(380 + rng() * 240) };
}

/** How long typing a prompt takes, from the tap to the send. */
export function typingMs(text: string): number {
  const { delays, sendMs } = typingSchedule(text);
  return delays.reduce((sum, ms) => sum + ms, 0) + sendMs;
}
