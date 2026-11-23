// A slow answer that rarely changes (a process run, a folder walk), kept for a
// while per key.
use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub(crate) struct TtlCache<K, V> {
    fresh: Duration,
    kept: Mutex<Option<HashMap<K, (V, Instant)>>>,
}

impl<K: Eq + Hash, V: Clone> TtlCache<K, V> {
    pub(crate) const fn new(fresh: Duration) -> Self {
        Self {
            fresh,
            kept: Mutex::new(None),
        }
    }

    /// The answer kept for `key` while it's fresh, else `make`'s, kept from
    /// now. `make` runs unlocked, so a slow one holds up no other key.
    pub(crate) fn get_or(&self, key: K, make: impl FnOnce() -> V) -> V {
        {
            let kept = self.kept.lock().unwrap();
            if let Some((value, at)) = kept.as_ref().and_then(|map| map.get(&key)) {
                if at.elapsed() < self.fresh {
                    return value.clone();
                }
            }
        }
        let value = make();
        self.kept
            .lock()
            .unwrap()
            .get_or_insert_with(HashMap::new)
            .insert(key, (value.clone(), Instant::now()));
        value
    }

    /// Work `key` out afresh next time.
    pub(crate) fn forget(&self, key: &K) {
        if let Some(map) = self.kept.lock().unwrap().as_mut() {
            map.remove(key);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_an_answer_until_it_goes_stale_or_is_forgotten() {
        let cache: TtlCache<&str, u32> = TtlCache::new(Duration::from_secs(60));
        assert_eq!(cache.get_or("a", || 1), 1);
        assert_eq!(cache.get_or("a", || 2), 1);
        assert_eq!(cache.get_or("b", || 3), 3);
        cache.forget(&"a");
        assert_eq!(cache.get_or("a", || 4), 4);

        let stale: TtlCache<(), u32> = TtlCache::new(Duration::ZERO);
        assert_eq!(stale.get_or((), || 1), 1);
        assert_eq!(stale.get_or((), || 2), 2);
    }
}
