// What the Usage page reads from the ping Worker's database (ping/migrations/).
// A week runs Monday to Sunday and days are UTC, as ping/ counts them.

const RANGES = {
  days: ["day", "daily", "day > date(?, '-91 days')"],
  weeks: ["date(day, 'weekday 0', '-6 days')", "weekly", "day >= date(?, 'weekday 0', '-90 days')"],
  months: ["substr(day, 1, 7)", "monthly", "day >= date(?, 'start of month', '-11 months')"],
};

function monthEnds(today) {
  return Array.from({ length: 11 }, (_, i) => {
    const day = new Date(today);
    day.setUTCDate(1);
    day.setUTCMonth(day.getUTCMonth() - i);
    day.setUTCDate(0);
    return `'${day.toISOString().slice(0, 10)}'`;
  });
}

// 91 days, 13 weeks and 12 months, each up to the one that holds today.
export function queries(today) {
  const from = (window) => window.replace("?", `'${today}'`);
  return {
    since: "SELECT MIN(day) AS day FROM counts",
    ...Object.fromEntries(
      Object.entries(RANGES).map(([id, [key, field, window]]) => [
        id,
        `SELECT ${key} AS key, kind, os, arch, cohort, SUM(${field}) AS n, SUM(weekly) AS weekly,
          SUM(monthly) AS monthly, SUM(installs) AS installs
          FROM counts WHERE ${from(window)} GROUP BY 1, kind, os, arch, cohort`,
      ]),
    ),
    // By day only: a week's and a month's own counts hold the version each
    // computer had when it was first seen in them, so those show their last day.
    versions: `SELECT day, version, SUM(daily) AS n FROM counts
      WHERE kind = 'desktop' AND (${from(RANGES.days[2])} OR day IN (${monthEnds(today)}))
      GROUP BY day, version`,
  };
}

export function todayQuery(today) {
  return `SELECT COALESCE(SUM(daily), 0) AS n FROM counts WHERE day = '${today}' AND kind = 'desktop'`;
}
