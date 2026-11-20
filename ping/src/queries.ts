// The one write, and the reports read back from it (scripts/report.mjs). A
// week runs Monday to Sunday and a month is a calendar month, both in UTC, as
// dailyping.rs counts them.

export const COUNT_PING = `INSERT INTO counts
  (day, version, os, arch, kind, cohort, daily, weekly, monthly, installs)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9)
  ON CONFLICT (day, version, os, arch, kind, cohort) DO UPDATE SET
    daily = daily + 1,
    weekly = weekly + excluded.weekly,
    monthly = monthly + excluded.monthly,
    installs = installs + excluded.installs`;

const byKind = (column: string) =>
  `SUM(CASE WHEN kind = 'desktop' THEN ${column} ELSE 0 END) AS desktop,
   ${["macos", "windows", "linux"]
     .map((os) => `SUM(CASE WHEN kind = 'desktop' AND os = '${os}' THEN ${column} ELSE 0 END) AS ${os}`)
     .join(",\n   ")},
   SUM(CASE WHEN kind = 'host' THEN ${column} ELSE 0 END) AS hosts`;

function day(today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`not a day: ${today}`);
  return `'${today}'`;
}

export function reports(today: string): Record<string, string> {
  const t = day(today);
  return {
    "Daily active": `SELECT day, ${byKind("daily")},
        SUM(CASE WHEN kind = 'desktop' THEN installs ELSE 0 END) AS new_installs
      FROM counts WHERE day > date(${t}, '-14 days')
      GROUP BY day ORDER BY day DESC`,
    "Weekly active": `SELECT date(day, 'weekday 0', '-6 days') AS week, ${byKind("weekly")}
      FROM counts WHERE day >= date(${t}, 'weekday 0', '-55 days')
      GROUP BY week ORDER BY week DESC`,
    "Monthly active": `SELECT substr(day, 1, 7) AS month, ${byKind("monthly")}
      FROM counts WHERE day >= date(${t}, 'start of month', '-5 months')
      GROUP BY month ORDER BY month DESC`,
    "This month's desktop users by install month": `SELECT cohort, SUM(monthly) AS users
      FROM counts WHERE day >= date(${t}, 'start of month') AND kind = 'desktop'
      GROUP BY cohort ORDER BY cohort DESC`,
    "Last 7 days by platform": `SELECT os, arch, kind, SUM(daily) AS pings
      FROM counts WHERE day > date(${t}, '-7 days')
      GROUP BY os, arch, kind ORDER BY pings DESC`,
    "Last 7 days by version": `SELECT version, SUM(daily) AS pings
      FROM counts WHERE day > date(${t}, '-7 days')
      GROUP BY version ORDER BY pings DESC LIMIT 10`,
  };
}
