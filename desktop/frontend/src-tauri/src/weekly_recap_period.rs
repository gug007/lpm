use chrono::{Datelike, Duration, Months, NaiveDate};
use serde::{Deserialize, Serialize};

/// What a recap covers: a week, Monday to Sunday, or a calendar month.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecapPeriod {
    #[default]
    Week,
    Month,
}

impl RecapPeriod {
    /// The day `count` periods after `first`, or before it when negative.
    pub(crate) fn shift(self, first: NaiveDate, count: i32) -> Option<NaiveDate> {
        match self {
            Self::Week => first.checked_add_signed(Duration::days(7 * i64::from(count))),
            Self::Month if count < 0 => first.checked_sub_months(Months::new(count.unsigned_abs())),
            Self::Month => first.checked_add_months(Months::new(count.unsigned_abs())),
        }
    }

    /// The first day of this period, or of the one before it for `last`.
    pub(crate) fn start(self, last: bool, today: NaiveDate) -> String {
        let current = match self {
            Self::Week => today - Duration::days(i64::from(today.weekday().num_days_from_monday())),
            Self::Month => today - Duration::days(i64::from(today.day0())),
        };
        let first = if last {
            self.shift(current, -1).unwrap_or(current)
        } else {
            current
        };
        first.format("%Y-%m-%d").to_string()
    }
}
