//! Durations as configs write them: seconds, or a number with `s`, `m` or `h`
//! (`labelRefresh`, a popup's `refresh` and `cache`).

pub(crate) fn parse_secs(text: &str) -> Option<u64> {
    let text = text.trim();
    let split = text.find(|c: char| !c.is_ascii_digit()).unwrap_or(text.len());
    let (num, unit) = text.split_at(split);
    let n = num.parse::<u64>().ok()?;
    match unit.trim() {
        "" | "s" => Some(n),
        "m" => Some(n.saturating_mul(60)),
        "h" => Some(n.saturating_mul(3600)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::parse_secs;

    #[test]
    fn reads_seconds_and_units() {
        assert_eq!(parse_secs("30"), Some(30));
        assert_eq!(parse_secs(" 5m "), Some(300));
        assert_eq!(parse_secs("2h"), Some(7200));
        assert_eq!(parse_secs("10 s"), Some(10));
        assert_eq!(parse_secs("soon"), None);
        assert_eq!(parse_secs("5d"), None);
    }
}
