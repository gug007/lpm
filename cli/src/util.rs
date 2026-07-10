//! Small time helpers shared across subcommands.

use std::time::{SystemTime, UNIX_EPOCH};

/// Current unix time in milliseconds (0 if the clock is before the epoch).
pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Human relative time for a past unix-millis timestamp, e.g. "3m ago".
pub fn relative(ts_ms: i64, now_ms: i64) -> String {
    if ts_ms <= 0 {
        return "unknown".into();
    }
    let secs = (now_ms - ts_ms) / 1000;
    if secs < 0 {
        return "in the future".into();
    }
    if secs < 10 {
        return "just now".into();
    }
    let (n, unit) = if secs < 60 {
        (secs, "s")
    } else if secs < 3600 {
        (secs / 60, "m")
    } else if secs < 86_400 {
        (secs / 3600, "h")
    } else if secs < 2_592_000 {
        (secs / 86_400, "d")
    } else if secs < 31_536_000 {
        (secs / 2_592_000, "mo")
    } else {
        (secs / 31_536_000, "y")
    };
    format!("{n}{unit} ago")
}

/// Replace a leading `$HOME` with `~` for compact display of absolute paths.
pub fn shorten_home(path: &str) -> String {
    let Some(home) = dirs::home_dir() else {
        return path.to_string();
    };
    let home = home.to_string_lossy();
    if path == home {
        return "~".to_string();
    }
    if let Some(rest) = path.strip_prefix(&format!("{home}/")) {
        return format!("~/{rest}");
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_buckets() {
        let now = 1_000_000_000;
        assert_eq!(relative(now, now), "just now");
        assert_eq!(relative(now - 30_000, now), "30s ago");
        assert_eq!(relative(now - 5 * 60_000, now), "5m ago");
        assert_eq!(relative(now - 3 * 3_600_000, now), "3h ago");
        assert_eq!(relative(now - 2 * 86_400_000, now), "2d ago");
        assert_eq!(relative(0, now), "unknown");
    }
}
