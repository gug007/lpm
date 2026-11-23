use super::event::{validate_event, EVENT_FIELDS};
use super::{
    text_at, validate_bool_field, validate_keys, validate_string_field, Mapping, Report, Value,
};

const SCHEDULE_FIELDS: [&str; 9] = [
    "at",
    "until",
    "times",
    "days",
    "shortMonths",
    "pickDays",
    "every",
    "manual",
    "cron",
];
const DAY_NAMES: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const NTH_WORDS: [&str; 5] = ["first", "second", "third", "fourth", "last"];
const CRON_MACROS: [&str; 7] = [
    "@yearly",
    "@annually",
    "@monthly",
    "@weekly",
    "@daily",
    "@midnight",
    "@hourly",
];
const MIN_GAP_SECS: u64 = 300;

enum Days {
    Weekdays(usize),
    MonthDates,
    Nth,
    OnDates,
}

pub(super) fn validate_schedule(map: &Mapping, path: &str, report: &mut Report) {
    let fields: Vec<&str> = SCHEDULE_FIELDS.iter().chain(&EVENT_FIELDS).copied().collect();
    validate_keys(map, &fields, path, report);
    if validate_event(map, path, report) {
        return;
    }
    for key in ["until", "shortMonths", "cron"] {
        validate_string_field(map, key, &format!("{path}.{key}"), report);
    }
    validate_bool_field(map, "manual", path, report);
    if map
        .get(Value::String("manual".into()))
        .and_then(Value::as_bool)
        == Some(true)
    {
        return;
    }

    let errors = report.errors.len();
    let ats = clock_list(
        map.get(Value::String("at".into())),
        &format!("{path}.at"),
        report,
    );
    let until = match text_at(map, "until") {
        "" => None,
        text => clock(text, &format!("{path}.until"), report),
    };
    let times = positive_int(map, "times", path, report);
    let pick_days = positive_int(map, "pickDays", path, report);
    let days = parse_days(map, path, report);
    if report.errors.len() > errors {
        return;
    }

    let cron = text_at(map, "cron");
    let has_days = !matches!(&days, Days::Weekdays(0));
    if !cron.is_empty() {
        if map.contains_key(Value::String("every".into())) || !ats.is_empty() || has_days {
            report.error(path, "a cron line replaces at, every and days; drop them");
        } else if !cron.starts_with('@') && cron.split_whitespace().count() != 5 {
            report.error(
                &format!("{path}.cron"),
                "expected five fields: minute hour day-of-month month day-of-week",
            );
        } else if cron.starts_with('@') && !CRON_MACROS.contains(&cron.to_lowercase().as_str()) {
            report.error(&format!("{path}.cron"), "unknown cron shorthand");
        }
        return;
    }

    if let Some(every) = map.get(Value::String("every".into())) {
        validate_interval(every, &ats, until, times, pick_days, &days, path, report);
        return;
    }
    if ats.is_empty() {
        report.error(path, "set at, every, cron or manual: true");
        return;
    }
    validate_calendar(&ats, until, times, pick_days, &days, path, report);
}

#[allow(clippy::too_many_arguments)]
fn validate_interval(
    every: &Value,
    ats: &[u32],
    until: Option<u32>,
    times: Option<u64>,
    pick_days: Option<u64>,
    days: &Days,
    path: &str,
    report: &mut Report,
) {
    if times.is_some() {
        report.error(&format!("{path}.times"), "runs a day go with at, not every");
    }
    if pick_days.is_some() {
        report.error(
            &format!("{path}.pickDays"),
            "picking days goes with at, not every",
        );
    }
    match (ats, until) {
        ([], None) => {}
        ([from], Some(to)) if to <= *from => report.error(
            &format!("{path}.until"),
            "the window has to end after it starts",
        ),
        ([_], Some(_)) => {}
        ([], Some(_)) => report.error(&format!("{path}.at"), "give the window a start time"),
        ([_], None) => report.error(&format!("{path}.until"), "give the window an end time"),
        _ => report.error(
            &format!("{path}.at"),
            "an interval takes one window, not a list of times",
        ),
    }
    if !matches!(days, Days::Weekdays(_)) {
        report.error(
            &format!("{path}.days"),
            "an interval can only be limited to weekdays",
        );
    }
    if let Err(message) = every_band(every) {
        report.error(&format!("{path}.every"), message);
    }
}

fn validate_calendar(
    ats: &[u32],
    until: Option<u32>,
    times: Option<u64>,
    pick_days: Option<u64>,
    days: &Days,
    path: &str,
    report: &mut Report,
) {
    let mut ats = ats.to_vec();
    ats.sort_unstable();
    ats.dedup();
    let at = ats[0];
    if let Some(until) = until {
        if ats.len() > 1 {
            report.error(
                &format!("{path}.until"),
                "a window starts at one time, not a list",
            );
        } else if until <= at {
            report.error(
                &format!("{path}.until"),
                "the window has to end after it starts",
            );
        }
    }
    let times = times.unwrap_or(1);
    match until {
        None if times > 1 => report.error(
            &format!("{path}.times"),
            "spreading runs needs an until window",
        ),
        Some(until) if until > at && u64::from(until - at) * 60 / times < MIN_GAP_SECS => report
            .error(
                &format!("{path}.times"),
                "more runs than the window has room for (5 minutes each)",
            ),
        _ => {}
    }
    if ats
        .windows(2)
        .any(|pair| u64::from(pair[1] - pair[0]) * 60 < MIN_GAP_SECS)
    {
        report.error(
            &format!("{path}.at"),
            "keep the times at least 5 minutes apart",
        );
    }
    if let Some(pick) = pick_days {
        match days {
            Days::Weekdays(count) => {
                let pool = if *count == 0 { 7 } else { *count };
                if pick as usize > pool {
                    report.error(
                        &format!("{path}.pickDays"),
                        format!("only {pool} days to pick from"),
                    );
                }
            }
            _ => report.error(
                &format!("{path}.pickDays"),
                "picking days works with weekdays only",
            ),
        }
    }
}

fn parse_days(map: &Mapping, path: &str, report: &mut Report) -> Days {
    let field = format!("{path}.days");
    let items: Vec<&Value> = match map.get(Value::String("days".into())) {
        None => Vec::new(),
        Some(Value::Sequence(list)) => list.iter().collect(),
        Some(item) => vec![item],
    };
    let short_months = text_at(map, "shortMonths").to_lowercase();
    if !matches!(short_months.as_str(), "" | "skip" | "last") {
        report.error(&format!("{path}.shortMonths"), "expected skip or last");
    }

    let days = if let [Value::String(text)] = items.as_slice() {
        let text = text.trim().to_lowercase();
        text.contains(char::is_whitespace).then(|| {
            if !is_nth(&text) {
                report.error(
                    &field,
                    "use a position like \"first mon\" or \"last weekday\"",
                );
            }
            Days::Nth
        })
    } else {
        None
    };
    let days = days.unwrap_or_else(|| {
        let (mut weekdays, mut month_dates, mut on_dates) = (0, false, false);
        for item in items {
            match day_kind(item) {
                Some(DayKind::Weekday) => weekdays += 1,
                Some(DayKind::MonthDate) => month_dates = true,
                Some(DayKind::OnDate) => on_dates = true,
                None => report.error(
                    &field,
                    "expected weekday names, dates of the month 1-31 or last, or YYYY-MM-DD dates",
                ),
            }
        }
        if [weekdays > 0, month_dates, on_dates]
            .iter()
            .filter(|set| **set)
            .count()
            > 1
        {
            report.error(
                &field,
                "use weekdays, dates of the month or calendar dates, not a mix",
            );
        }
        if on_dates {
            Days::OnDates
        } else if month_dates {
            Days::MonthDates
        } else {
            Days::Weekdays(weekdays)
        }
    });
    if !short_months.is_empty() && !matches!(days, Days::MonthDates) {
        report.error(
            &format!("{path}.shortMonths"),
            "shortMonths only goes with dates of the month",
        );
    }
    days
}

enum DayKind {
    Weekday,
    MonthDate,
    OnDate,
}

fn day_kind(item: &Value) -> Option<DayKind> {
    let date = |n: i64| (1..=31).contains(&n).then_some(DayKind::MonthDate);
    if let Some(n) = item.as_i64() {
        return date(n);
    }
    let text = item.as_str()?.trim().to_lowercase();
    if text == "last" {
        return Some(DayKind::MonthDate);
    }
    if let Ok(n) = text.parse::<i64>() {
        return date(n);
    }
    if is_calendar_date(&text) {
        return Some(DayKind::OnDate);
    }
    DAY_NAMES
        .contains(&text.as_str())
        .then_some(DayKind::Weekday)
}

fn is_nth(text: &str) -> bool {
    let words: Vec<&str> = text.split_whitespace().collect();
    let [nth, of] = words.as_slice() else {
        return false;
    };
    NTH_WORDS.contains(nth) && (matches!(*of, "day" | "weekday") || DAY_NAMES.contains(of))
}

fn is_calendar_date(text: &str) -> bool {
    let parts: Vec<&str> = text.split('-').collect();
    let [year, month, day] = parts.as_slice() else {
        return false;
    };
    if year.len() != 4 || month.len() != 2 || day.len() != 2 {
        return false;
    }
    let (Ok(year), Ok(month), Ok(day)) = (
        year.parse::<u32>(),
        month.parse::<u32>(),
        day.parse::<u32>(),
    ) else {
        return false;
    };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days_in_month).contains(&day)
}

fn clock_list(value: Option<&Value>, path: &str, report: &mut Report) -> Vec<u32> {
    let items: Vec<&Value> = match value {
        None => return Vec::new(),
        Some(Value::Sequence(list)) => list.iter().collect(),
        Some(item) => vec![item],
    };
    items
        .into_iter()
        .filter_map(|item| match item.as_str() {
            Some(text) if text.trim().is_empty() => None,
            Some(text) => clock(text, path, report),
            None => {
                report.error(path, "expected a time like \"09:00\"");
                None
            }
        })
        .collect()
}

fn clock(text: &str, path: &str, report: &mut Report) -> Option<u32> {
    let parsed = text.split_once(':').and_then(|(hours, minutes)| {
        let hours: u32 = hours.trim().parse().ok()?;
        let minutes: u32 = minutes.trim().parse().ok()?;
        (hours < 24 && minutes < 60).then_some(hours * 60 + minutes)
    });
    if parsed.is_none() {
        report.error(path, "expected a time like \"09:00\"");
    }
    parsed
}

fn every_band(value: &Value) -> Result<(), &'static str> {
    if let Some(hours) = value.as_i64() {
        return if hours > 0 {
            Ok(())
        } else {
            Err("the interval must be at least 5 minutes")
        };
    }
    let text = value
        .as_str()
        .ok_or("expected a length like 30m, 6h, 2d or a band like 4h-8h")?
        .trim()
        .to_lowercase();
    let Some((low, high)) = text.split_once('-') else {
        return every_secs(&text).map(|_| ());
    };
    let (low, high) = (low.trim(), high.trim());
    let has_unit = |s: &str| s.ends_with(['m', 'h', 'd']);
    let low = if has_unit(high) && !has_unit(low) {
        format!("{low}{}", &high[high.len() - 1..])
    } else {
        low.to_string()
    };
    if every_secs(&low)? > every_secs(high)? {
        return Err("the longest gap has to be at least the shortest");
    }
    Ok(())
}

fn every_secs(text: &str) -> Result<u64, &'static str> {
    let (number, unit) = match text.chars().last() {
        Some('m') => (&text[..text.len() - 1], 60),
        Some('h') => (&text[..text.len() - 1], 3600),
        Some('d') => (&text[..text.len() - 1], 86_400),
        _ => (text, 3600),
    };
    let secs = number
        .trim()
        .parse::<u64>()
        .ok()
        .and_then(|n| n.checked_mul(unit))
        .ok_or("expected a length like 30m, 6h, 2d or a band like 4h-8h")?;
    if secs < MIN_GAP_SECS {
        return Err("the interval must be at least 5 minutes");
    }
    Ok(secs)
}

fn positive_int(map: &Mapping, key: &str, path: &str, report: &mut Report) -> Option<u64> {
    let value = map.get(Value::String(key.into()))?;
    match value.as_u64().filter(|n| *n > 0) {
        Some(n) => Some(n),
        None => {
            report.error(&format!("{path}.{key}"), "expected a whole number above 0");
            None
        }
    }
}
