// Offset-positioned output rings for terminal streams.
//
// Each terminal's recent output is kept as a bounded window of its byte stream
// tagged with the absolute offset it sits at. A viewer that still has the
// terminal on screen — one that briefly dropped and reconnected — reports the
// offset it got to and is handed exactly the bytes it missed, so its emulator
// keeps its state. Only a viewer with no surviving screen, or one whose offset
// has already scrolled out, gets a replay: a replay can only approximate the
// screen a running full-screen program believes it is drawing on, and the
// program's next incremental update then lands on cells that don't match.
//
// Modelled on the mobile server's rings (remote.rs), which resume phones the
// same way.

use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, MutexGuard};

const RING_CAP: usize = 512 * 1024; // output kept, so a viewer that dropped can resume
const SEED_CAP: usize = 96 * 1024; // recent scrollback replayed onto a fresh screen

/// Recent output for one terminal, positioned in that terminal's byte stream.
/// `base` is the stream offset of the first byte still held.
#[derive(Default)]
pub struct Ring {
    buf: VecDeque<u8>,
    base: u64,
    /// Whether bytes were dropped from in front of what is held, leaving the
    /// first byte held part-way through a line. Tracked separately from `base`,
    /// which also moves when offsets are retired without anything held being
    /// lost — see `invalidate`.
    truncated: bool,
}

impl Ring {
    /// Total bytes this terminal has ever emitted — the offset a viewer is at
    /// once it has applied everything in the ring.
    pub fn total(&self) -> u64 {
        self.base + self.buf.len() as u64
    }

    /// Append a chunk, returning the stream offset it ends at. The oldest bytes
    /// fall off once the ring is full; `base` tracks them so offsets stay
    /// absolute for the terminal's whole life.
    pub fn push(&mut self, text: &str) -> u64 {
        self.buf.extend(text.as_bytes());
        let over = self.buf.len().saturating_sub(RING_CAP);
        if over > 0 {
            self.buf.drain(..over);
            self.base += over as u64;
            self.truncated = true;
        }
        self.total()
    }

    /// Recent scrollback to replay onto a cleared screen, with the stream offset
    /// it ends at. A partial leading line is dropped whenever the text starts
    /// mid-stream — either because the tail was trimmed to the seed cap or
    /// because older bytes fell out of the ring — so the replay begins on a row
    /// boundary instead of part-way through a line or an escape sequence.
    pub fn seed(&self) -> (String, u64) {
        let skip = self.buf.len().saturating_sub(SEED_CAP);
        let bytes: Vec<u8> = self.buf.iter().skip(skip).copied().collect();
        let s = String::from_utf8_lossy(&bytes).into_owned();
        let partial = skip > 0 || self.truncated;
        let text = match (partial, s.find('\n')) {
            (true, Some(i)) => s[i + 1..].to_string(),
            _ => s,
        };
        (text, self.total())
    }

    /// The output missed since stream offset `from`, with the offset it ends at.
    /// `None` when `from` has already scrolled out of the ring, or lies ahead of
    /// it (a terminal that restarted under the same id), so only a replay can
    /// resync.
    pub fn since(&self, from: u64) -> Option<(String, u64)> {
        if from < self.base || from > self.total() {
            return None;
        }
        let bytes: Vec<u8> = self
            .buf
            .iter()
            .skip((from - self.base) as usize)
            .copied()
            .collect();
        Some((String::from_utf8_lossy(&bytes).into_owned(), self.total()))
    }

    /// Forget what is held and move the stream past every offset handed out so
    /// far. Used when output stopped being recorded while the terminal kept
    /// running: the bytes emitted during that gap are gone, so no earlier offset
    /// may be honoured — `since` would return a slice with a silent hole in front
    /// of it. Offsets only ever move forward, so the ones minted afterwards can
    /// never collide with the ones a viewer is still holding.
    ///
    /// Only the offsets are retired. What gets recorded from here on is a whole
    /// run with nothing dropped in front of it, so seeds replay it intact: taking
    /// the jumped offset for a sign that the text starts mid-line would dock the
    /// first line off every seed for the rest of the terminal's life.
    pub fn invalidate(&mut self) {
        self.base = self.total() + 1;
        self.buf.clear();
        self.truncated = false;
    }
}

/// The rings of every live terminal, keyed by terminal id. Locks internally so
/// the PTY reader can append from its own thread while a connection thread seeds.
#[derive(Default)]
pub struct PtyRings {
    rings: Mutex<HashMap<String, Ring>>,
}

/// The rings held for the length of one critical section. Appending a chunk and
/// fanning it out to viewers, and subscribing a viewer then reading where the
/// stream has got to, are each a pair of steps that must not interleave: a chunk
/// landing between a viewer's subscribe and its read would reach it twice, once
/// inside the resume slice and again live. Holding this guard across both steps
/// on both sides is what keeps them apart.
pub struct RingsGuard<'a>(MutexGuard<'a, HashMap<String, Ring>>);

impl RingsGuard<'_> {
    pub fn push(&mut self, id: &str, text: &str) -> u64 {
        self.0.entry(id.to_string()).or_default().push(text)
    }

    /// A replay for a fresh screen. An unknown terminal seeds empty at offset 0,
    /// which is also where its stream starts.
    pub fn seed(&self, id: &str) -> (String, u64) {
        match self.0.get(id) {
            Some(r) => r.seed(),
            None => (String::new(), 0),
        }
    }

    pub fn since(&self, id: &str, from: u64) -> Option<(String, u64)> {
        self.0.get(id)?.since(from)
    }
}

impl PtyRings {
    /// Take the rings for a critical section — see `RingsGuard`. Nothing that can
    /// block belongs inside one: the PTY readers append through it.
    pub fn locked(&self) -> RingsGuard<'_> {
        RingsGuard(self.rings.lock().unwrap())
    }

    pub fn drop_ring(&self, id: &str) {
        self.rings.lock().unwrap().remove(id);
    }

    /// Refuse every offset handed out so far, for every terminal — see
    /// `Ring::invalidate`.
    pub fn invalidate_all(&self) {
        for r in self.rings.lock().unwrap().values_mut() {
            r.invalidate();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A viewer that was away must get back exactly the bytes it missed: replaying
    // the screen instead leaves a running full-screen program drawing its next
    // incremental update onto cells that don't match.
    #[test]
    fn resume_hands_back_only_the_missed_slice() {
        let rings = PtyRings::default();
        let mut r = rings.locked();
        assert_eq!(r.push("t1", "hello "), 6);
        let away_at = r.push("t1", "world");
        r.push("t1", " again");

        let (missed, off) = r.since("t1", away_at).expect("offset still held");
        assert_eq!(missed, " again");
        assert_eq!(off, 17);
        // Caught up: nothing to apply, and the screen is left alone.
        assert_eq!(r.since("t1", off), Some((String::new(), 17)));
    }

    #[test]
    fn resume_falls_back_to_a_replay_when_the_offset_is_unusable() {
        let rings = PtyRings::default();
        let mut r = rings.locked();
        r.push("t1", "scrolled away");
        r.push("t1", &"x".repeat(RING_CAP));

        // Older than the ring still holds — only a full replay can resync.
        assert!(r.since("t1", 0).is_none());
        // Ahead of the stream (a terminal that restarted under the same id).
        assert!(r.since("t1", 1_000_000).is_none());
        // Unknown terminal: nothing to resume from.
        assert!(r.since("nope", 0).is_none());
    }

    #[test]
    fn seed_replays_the_recent_tail_from_a_clean_row() {
        let rings = PtyRings::default();
        let mut r = rings.locked();
        r.push("t1", "line one\nline two\n");
        assert_eq!(
            r.seed("t1"),
            ("line one\nline two\n".to_string(), 18),
            "a short stream seeds whole — nothing was cut mid-line"
        );

        // Past the seed cap the replay is trimmed to the tail, dropping the
        // partial first line so it starts on a row boundary. The ring itself is
        // nowhere near full here: what makes the text partial is the trim, not
        // the ring having overflowed.
        r.push("t1", &"y".repeat(SEED_CAP));
        r.push("t1", "\ntail");
        let (data, off) = r.seed("t1");
        assert_eq!(data, "tail");
        assert_eq!(off, 18 + SEED_CAP as u64 + 5);
    }

    #[test]
    fn dropping_a_ring_forgets_the_terminal() {
        let rings = PtyRings::default();
        rings.locked().push("t1", "output");
        rings.drop_ring("t1");
        let r = rings.locked();
        assert_eq!(r.seed("t1"), (String::new(), 0));
        assert!(r.since("t1", 0).is_none());
    }

    // Hosting turned off, the terminal kept running, and its output went
    // unrecorded. A viewer coming back with an offset from before that gap must
    // be refused a resume: the bytes in front of the slice it would get are gone
    // for good, so only a replay can resync it.
    #[test]
    fn invalidating_refuses_every_offset_handed_out_before_the_gap() {
        let rings = PtyRings::default();
        let away_at = rings.locked().push("t1", "recorded");

        rings.invalidate_all();
        assert!(rings.locked().since("t1", away_at).is_none());

        // Recording resumes past the offsets already out in the world, so no
        // later chunk can make a stale one look resumable again.
        let mut r = rings.locked();
        r.push("t1", "output that came after");
        assert!(r.since("t1", away_at).is_none());
        assert!(r.since("t1", 0).is_none());

        // Offsets minted after the gap resume normally.
        let (_, now_at) = r.seed("t1");
        assert!(now_at > away_at);
        assert_eq!(r.since("t1", now_at), Some((String::new(), now_at)));
    }

    // Retiring the offsets is all a gap does. What is recorded after it is a whole
    // run, so its first line belongs in the replay — for every seed, not just the
    // first, and however many gaps the terminal has lived through.
    #[test]
    fn a_gap_does_not_dock_a_line_off_later_seeds() {
        let rings = PtyRings::default();
        rings.locked().push("t1", "before the gap\n");
        rings.invalidate_all();
        rings.invalidate_all();

        let mut r = rings.locked();
        r.push("t1", "line one\nline two\n");
        assert_eq!(r.seed("t1").0, "line one\nline two\n");
        r.push("t1", "line three\n");
        assert_eq!(r.seed("t1").0, "line one\nline two\nline three\n");
    }

    // Bytes actually falling out of the ring still leave the first line held
    // part-way through, so the replay starts on the row after it.
    #[test]
    fn a_full_ring_still_seeds_from_a_clean_row() {
        let mut ring = Ring::default();
        ring.push(&"x".repeat(RING_CAP - 4));
        ring.push("cut\nkept\n");
        assert!(ring.truncated, "the ring overflowed");
        assert_eq!(ring.seed().0, "kept\n");
    }
}
