//! A paired Mac's video, read ahead in whole chunks. WebKit asks a video for
//! many small byte ranges, each of which was a round trip to the other Mac, so
//! a clip took as many round trips to start as it had ranges. A range is now
//! cut from 1 MiB blocks fetched once, and while the player reads straight on,
//! the next blocks are on their way before it asks for them.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

use tauri::http::StatusCode;

use crate::mediaproto::{parse_range, Chunk, Media, MAX_CHUNK};

/// What the host answers in one go.
pub(crate) const BLOCK: u64 = MAX_CHUNK;
/// Kept across every file, least recently used out first.
const MAX_BLOCKS: usize = 48;
const READ_AHEAD: u64 = 2;
/// A file left alone this long is let go, and read afresh if it comes back.
const IDLE: Duration = Duration::from_secs(5);
/// Longer than the peer request itself, which fails on its own.
const WAIT: Duration = Duration::from_secs(40);

/// A block from the host, with the file's modification time when the host
/// reports one: with the length, it tells one version of the file from another.
pub(crate) struct Fetched {
    pub media: Media,
    pub stamp: Option<u64>,
}

/// Fetches block `n` (bytes `n * BLOCK ..`) of one file from its host.
pub(crate) type FetchBlock = Arc<dyn Fn(u64) -> Result<Fetched, StatusCode> + Send + Sync>;

type Key = (String, String);
type Version = (u64, Option<u64>);

#[derive(Default)]
struct File {
    version: Option<Version>,
    mime: String,
    blocks: HashMap<u64, (Arc<Vec<u8>>, Instant)>,
    inflight: HashSet<u64>,
    ahead: usize,
    last_block: Option<u64>,
    used: Option<Instant>,
}

impl File {
    fn forget(&mut self) {
        self.version = None;
        self.blocks.clear();
        self.last_block = None;
    }
}

enum Got {
    Block {
        version: Version,
        mime: String,
        data: Arc<Vec<u8>>,
    },
    Past(u64),
}

enum Failed {
    Status(StatusCode),
    // The file changed between the blocks one range is cut from.
    Changed,
}

impl From<StatusCode> for Failed {
    fn from(status: StatusCode) -> Self {
        Failed::Status(status)
    }
}

#[derive(Default)]
pub(crate) struct Cache {
    files: Mutex<HashMap<Key, File>>,
    ready: Condvar,
    sweeping: AtomicBool,
}

pub(crate) fn shared() -> Arc<Cache> {
    static CACHE: OnceLock<Arc<Cache>> = OnceLock::new();
    CACHE.get_or_init(Arc::default).clone()
}

/// One range WebKit asked for, of the file `key` (slug, host path). A file that
/// keeps changing under the read answers CONFLICT, and the caller asks the host
/// for the range itself.
pub(crate) fn serve(
    cache: &Arc<Cache>,
    key: Key,
    range: &str,
    fetch: FetchBlock,
) -> Result<Media, StatusCode> {
    cache.sweep_later();
    for _ in 0..2 {
        match cache.serve_once(&key, range, &fetch) {
            Ok(media) => return Ok(media),
            Err(Failed::Status(status)) => return Err(status),
            Err(Failed::Changed) => cache.forget(&key),
        }
    }
    Err(StatusCode::CONFLICT)
}

fn range_start(range: &str) -> Option<u64> {
    let spec = range.trim().strip_prefix("bytes=")?;
    spec.split('-').next()?.trim().parse().ok()
}

/// A block marked as being fetched; dropped unfinished (a failed or panicking
/// fetch), it lets the requests waiting on it try for themselves.
struct Claim<'a> {
    cache: &'a Cache,
    key: Key,
    n: u64,
    ahead: bool,
}

impl Drop for Claim<'_> {
    fn drop(&mut self) {
        let mut files = self.cache.lock();
        if let Some(file) = files.get_mut(&self.key) {
            file.inflight.remove(&self.n);
            if self.ahead {
                file.ahead = file.ahead.saturating_sub(1);
            }
        }
        drop(files);
        self.cache.ready.notify_all();
    }
}

impl Cache {
    fn lock(&self) -> MutexGuard<'_, HashMap<Key, File>> {
        self.files.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn forget(&self, key: &Key) {
        if let Some(file) = self.lock().get_mut(key) {
            file.forget();
        }
    }

    fn serve_once(
        self: &Arc<Self>,
        key: &Key,
        range: &str,
        fetch: &FetchBlock,
    ) -> Result<Media, Failed> {
        // The file's length, which the range is read against, comes with any
        // block; the one the range starts in is needed anyway.
        let first = range_start(range).map_or(0, |start| start / BLOCK);
        let (version, mime) = match self.block(key, first, fetch)? {
            Got::Block { version, mime, .. } => (version, mime),
            Got::Past(len) => return Ok(Media::Unsatisfiable(len)),
        };
        let len = version.0;
        let Some((start, end)) = parse_range(range, len) else {
            return Ok(Media::Unsatisfiable(len));
        };
        let mut data = Vec::with_capacity((end - start + 1) as usize);
        for n in start / BLOCK..=end / BLOCK {
            let Got::Block {
                version: now,
                data: block,
                ..
            } = self.block(key, n, fetch)?
            else {
                return Err(Failed::Changed);
            };
            let base = n * BLOCK;
            let from = start.max(base) - base;
            let to = end.min(base + BLOCK - 1) - base;
            if now != version || to >= block.len() as u64 {
                return Err(Failed::Changed);
            }
            data.extend_from_slice(&block[from as usize..=to as usize]);
        }
        self.read_on(key, start / BLOCK, end / BLOCK, len, fetch);
        Ok(Media::Bytes(Chunk {
            len,
            start,
            end,
            partial: true,
            mime,
            data,
        }))
    }

    fn block(&self, key: &Key, n: u64, fetch: &FetchBlock) -> Result<Got, StatusCode> {
        let mut files = self.lock();
        loop {
            let file = files.entry(key.clone()).or_default();
            if file.used.is_some_and(|t| t.elapsed() > IDLE) {
                file.forget();
            }
            file.used = Some(Instant::now());
            if let Some((data, used)) = file.blocks.get_mut(&n) {
                *used = Instant::now();
                if let Some(version) = file.version {
                    return Ok(Got::Block {
                        version,
                        mime: file.mime.clone(),
                        data: data.clone(),
                    });
                }
            }
            if file.inflight.insert(n) {
                break;
            }
            let (guard, wait) = self
                .ready
                .wait_timeout(files, WAIT)
                .unwrap_or_else(|e| e.into_inner());
            files = guard;
            if wait.timed_out() {
                return Err(StatusCode::GATEWAY_TIMEOUT);
            }
        }
        drop(files);
        let claim = Claim {
            cache: self,
            key: key.clone(),
            n,
            ahead: false,
        };
        self.fetch_claimed(claim, fetch)
    }

    fn fetch_claimed(&self, claim: Claim<'_>, fetch: &FetchBlock) -> Result<Got, StatusCode> {
        let fetched = fetch(claim.n)?;
        let mut files = self.lock();
        let file = files.entry(claim.key.clone()).or_default();
        let got = match fetched.media {
            Media::Bytes(chunk) => {
                let version = (chunk.len, fetched.stamp);
                if file.version != Some(version) {
                    file.forget();
                    file.version = Some(version);
                }
                file.mime = chunk.mime.clone();
                let data = Arc::new(chunk.data);
                file.blocks.insert(claim.n, (data.clone(), Instant::now()));
                Got::Block {
                    version,
                    mime: chunk.mime,
                    data,
                }
            }
            Media::Unsatisfiable(len) => Got::Past(len),
        };
        evict(&mut files);
        drop(files);
        drop(claim);
        Ok(got)
    }

    /// While the player reads straight on, the blocks after the one it is in
    /// are fetched before it asks; a seek or a scrub fetches nothing extra.
    fn read_on(self: &Arc<Self>, key: &Key, first: u64, last: u64, len: u64, fetch: &FetchBlock) {
        let mut files = self.lock();
        let Some(file) = files.get_mut(key) else {
            return;
        };
        let straight_on = file
            .last_block
            .is_some_and(|prev| first == prev || first == prev + 1);
        file.last_block = Some(last);
        if !straight_on {
            return;
        }
        let mut claimed = Vec::new();
        for n in last + 1..=last + READ_AHEAD {
            if n * BLOCK >= len || file.ahead >= READ_AHEAD as usize {
                break;
            }
            if !file.blocks.contains_key(&n) && file.inflight.insert(n) {
                file.ahead += 1;
                claimed.push(n);
            }
        }
        drop(files);
        for n in claimed {
            let (cache, key, fetch) = (self.clone(), key.clone(), fetch.clone());
            std::thread::spawn(move || {
                let claim = Claim {
                    cache: &cache,
                    key,
                    n,
                    ahead: true,
                };
                let _ = cache.fetch_claimed(claim, &fetch);
            });
        }
    }

    /// Lets go of files nobody has read from for a while, so a clip watched
    /// once isn't held for the life of the app.
    fn sweep_later(self: &Arc<Self>) {
        if self.sweeping.swap(true, Ordering::SeqCst) {
            return;
        }
        let cache = self.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(IDLE);
            let mut files = cache.lock();
            files.retain(|_, f| {
                !f.inflight.is_empty() || f.used.is_some_and(|t| t.elapsed() <= IDLE)
            });
            if files.is_empty() {
                cache.sweeping.store(false, Ordering::SeqCst);
                return;
            }
        });
    }
}

fn evict(files: &mut HashMap<Key, File>) {
    loop {
        let held: usize = files.values().map(|f| f.blocks.len()).sum();
        if held <= MAX_BLOCKS {
            break;
        }
        let oldest = files
            .iter()
            .flat_map(|(k, f)| {
                f.blocks
                    .iter()
                    .map(move |(n, (_, used))| (*used, k.clone(), *n))
            })
            .min_by_key(|(used, _, _)| *used);
        let Some((_, key, n)) = oldest else { break };
        if let Some(file) = files.get_mut(&key) {
            file.blocks.remove(&n);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    // A host holding `file` (modified at `stamp`), counting the blocks it is
    // asked for.
    fn host(file: Vec<u8>, stamp: u64, calls: Arc<AtomicUsize>) -> FetchBlock {
        Arc::new(move |n| {
            calls.fetch_add(1, Ordering::SeqCst);
            let len = file.len() as u64;
            let start = n * BLOCK;
            let media = if start >= len {
                Media::Unsatisfiable(len)
            } else {
                let end = (start + BLOCK).min(len);
                Media::Bytes(Chunk {
                    len,
                    start,
                    end: end - 1,
                    partial: true,
                    mime: "video/mp4".into(),
                    data: file[start as usize..end as usize].to_vec(),
                })
            };
            Ok(Fetched {
                media,
                stamp: Some(stamp),
            })
        })
    }

    fn key() -> Key {
        ("abcd1234".into(), "/srv/clip.mp4".into())
    }

    fn bytes(media: Media) -> (u64, u64, Vec<u8>) {
        match media {
            Media::Bytes(c) => (c.start, c.end, c.data),
            Media::Unsatisfiable(len) => panic!("unsatisfiable, len {len}"),
        }
    }

    fn settle(cache: &Cache) {
        for _ in 0..200 {
            if cache.lock().values().all(|f| f.inflight.is_empty()) {
                return;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    fn ranges(cache: &Arc<Cache>, fetch: &FetchBlock, from: u64, to: u64, step: u64) {
        for start in (from..to).step_by(step as usize) {
            let range = format!("bytes={start}-{}", start + step - 1);
            serve(cache, key(), &range, fetch.clone()).unwrap();
        }
    }

    #[test]
    fn many_small_ranges_cost_one_round_trip_per_block() {
        let file: Vec<u8> = (0..(4 * BLOCK as usize)).map(|i| (i % 253) as u8).collect();
        let calls = Arc::new(AtomicUsize::new(0));
        let cache = Arc::new(Cache::default());
        let fetch = host(file.clone(), 1, calls.clone());
        for start in (0..BLOCK).step_by(128 * 1024) {
            let range = format!("bytes={start}-{}", start + 128 * 1024 - 1);
            let (s, e, data) = bytes(serve(&cache, key(), &range, fetch.clone()).unwrap());
            assert_eq!(data, file[s as usize..=e as usize]);
        }
        settle(&cache);
        // Block 0 for the ranges, blocks 1 and 2 read ahead — not one per range.
        assert_eq!(calls.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn a_seek_fetches_only_what_it_reads() {
        let file = vec![0u8; 20 * BLOCK as usize];
        let calls = Arc::new(AtomicUsize::new(0));
        let cache = Arc::new(Cache::default());
        let fetch = host(file, 1, calls.clone());
        for n in [0u64, 9, 3, 15, 6] {
            let range = format!("bytes={}-{}", n * BLOCK + 10, n * BLOCK + 20);
            serve(&cache, key(), &range, fetch.clone()).unwrap();
        }
        settle(&cache);
        assert_eq!(calls.load(Ordering::SeqCst), 5);
    }

    #[test]
    fn a_range_across_a_block_edge_is_joined() {
        let file: Vec<u8> = (0..(2 * BLOCK as usize + 10))
            .map(|i| (i % 251) as u8)
            .collect();
        let cache = Arc::new(Cache::default());
        let fetch = host(file.clone(), 1, Arc::new(AtomicUsize::new(0)));
        let range = format!("bytes={}-{}", BLOCK - 5, BLOCK + 4);
        let (s, e, data) = bytes(serve(&cache, key(), &range, fetch).unwrap());
        assert_eq!((s, e), (BLOCK - 5, BLOCK + 4));
        assert_eq!(data, file[(BLOCK - 5) as usize..=(BLOCK + 4) as usize]);
    }

    #[test]
    fn open_ended_and_suffix_ranges_read_from_the_end() {
        let file: Vec<u8> = (0..(BLOCK as usize + 100)).map(|i| (i % 7) as u8).collect();
        let cache = Arc::new(Cache::default());
        let fetch = host(file.clone(), 1, Arc::new(AtomicUsize::new(0)));
        let (s, e, data) = bytes(serve(&cache, key(), "bytes=-50", fetch.clone()).unwrap());
        assert_eq!((s, e), (BLOCK + 50, BLOCK + 99));
        assert_eq!(data, file[(BLOCK + 50) as usize..]);
        let (s, e, _) = bytes(serve(&cache, key(), &format!("bytes={}-", BLOCK), fetch).unwrap());
        assert_eq!((s, e), (BLOCK, BLOCK + 99));
    }

    #[test]
    fn a_range_past_the_end_is_unsatisfiable() {
        let cache = Arc::new(Cache::default());
        let fetch = host(vec![1; 10], 1, Arc::new(AtomicUsize::new(0)));
        assert!(matches!(
            serve(&cache, key(), "bytes=10-20", fetch.clone()),
            Ok(Media::Unsatisfiable(10))
        ));
        assert!(matches!(
            serve(&cache, key(), &format!("bytes={}-", 5 * BLOCK), fetch),
            Ok(Media::Unsatisfiable(10))
        ));
    }

    #[test]
    fn requests_for_the_same_block_share_one_fetch() {
        let calls = Arc::new(AtomicUsize::new(0));
        let slow: FetchBlock = {
            let inner = host(vec![9; 100], 1, calls.clone());
            Arc::new(move |n| {
                std::thread::sleep(Duration::from_millis(50));
                inner(n)
            })
        };
        let cache = Arc::new(Cache::default());
        let threads: Vec<_> = (0..4)
            .map(|i| {
                let (cache, fetch) = (cache.clone(), slow.clone());
                std::thread::spawn(move || {
                    serve(&cache, key(), &format!("bytes={i}-{}", i + 5), fetch)
                })
            })
            .collect();
        for t in threads {
            assert!(t.join().unwrap().is_ok());
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_replaced_file_is_read_afresh_even_at_the_same_length() {
        let calls = Arc::new(AtomicUsize::new(0));
        let cache = Arc::new(Cache::default());
        let old = host(vec![1; 3 * BLOCK as usize], 1, calls.clone());
        let new = host(vec![2; 3 * BLOCK as usize], 2, calls);
        serve(&cache, key(), "bytes=0-1", old.clone()).unwrap();
        // The old block 0 is cached; the range runs into block 1, which the host
        // now serves from the new file.
        let range = format!("bytes={}-{}", BLOCK - 2, BLOCK + 1);
        let (_, _, data) = bytes(serve(&cache, key(), &range, new).unwrap());
        assert_eq!(data, vec![2, 2, 2, 2]);
    }

    #[test]
    fn a_file_that_keeps_changing_is_left_to_the_host() {
        let n = Arc::new(AtomicUsize::new(0));
        let changing: FetchBlock = {
            let n = n.clone();
            Arc::new(move |b| {
                let stamp = n.fetch_add(1, Ordering::SeqCst) as u64;
                host(
                    vec![3; 2 * BLOCK as usize],
                    stamp,
                    Arc::new(AtomicUsize::new(0)),
                )(b)
            })
        };
        let cache = Arc::new(Cache::default());
        let range = format!("bytes={}-{}", BLOCK - 2, BLOCK + 1);
        assert_eq!(
            serve(&cache, key(), &range, changing).err(),
            Some(StatusCode::CONFLICT)
        );
    }

    #[test]
    fn memory_stays_bounded() {
        let file = vec![0u8; (MAX_BLOCKS as u64 * 2 * BLOCK) as usize];
        let cache = Arc::new(Cache::default());
        let fetch = host(file, 1, Arc::new(AtomicUsize::new(0)));
        ranges(&cache, &fetch, 0, MAX_BLOCKS as u64 * 2 * BLOCK, BLOCK);
        settle(&cache);
        let held: usize = cache.lock().values().map(|f| f.blocks.len()).sum();
        assert!(held <= MAX_BLOCKS, "{held}");
    }

    #[test]
    fn a_failed_or_panicking_fetch_frees_its_block() {
        let cache = Arc::new(Cache::default());
        let failing: FetchBlock = Arc::new(|_| Err(StatusCode::BAD_GATEWAY));
        assert_eq!(
            serve(&cache, key(), "bytes=0-1", failing).err(),
            Some(StatusCode::BAD_GATEWAY)
        );
        let panicking: FetchBlock = Arc::new(|_| panic!("lost"));
        let c = cache.clone();
        assert!(
            std::thread::spawn(move || serve(&c, key(), "bytes=0-1", panicking))
                .join()
                .is_err()
        );
        assert!(cache.lock().values().all(|f| f.inflight.is_empty()));
        let fetch = host(vec![5; 10], 1, Arc::new(AtomicUsize::new(0)));
        assert!(serve(&cache, key(), "bytes=0-1", fetch).is_ok());
    }
}
