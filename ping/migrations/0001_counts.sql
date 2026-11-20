-- One row per day and kind of computer, holding totals only: a ping adds one
-- to `daily` and its flags to the rest. Nothing here can tell two pings apart.
CREATE TABLE counts (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  kind TEXT NOT NULL,
  cohort TEXT NOT NULL,
  daily INTEGER NOT NULL,
  weekly INTEGER NOT NULL,
  monthly INTEGER NOT NULL,
  installs INTEGER NOT NULL,
  PRIMARY KEY (day, version, os, arch, kind, cohort)
) WITHOUT ROWID;
