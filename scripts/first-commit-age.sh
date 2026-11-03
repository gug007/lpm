#!/bin/sh
first=$(git log --max-parents=0 --date=format-local:'%Y %m %d' --format=%cd HEAD | tail -1)
[ -n "$first" ] || exit 1
echo "$first $(date '+%Y %m %d')" | awk '
function dim(y, m) {
  if (m == 2) return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 ? 29 : 28
  return m == 4 || m == 6 || m == 9 || m == 11 ? 30 : 31
}
{
  m = ($4 - $1) * 12 + $5 - $2
  d = $6 - $3
  if (d < 0) {
    m--
    pm = $5 - 1; py = $4
    if (pm == 0) { pm = 12; py-- }
    d = $6 + (dim(py, pm) > $3 ? dim(py, pm) - $3 : 0)
  }
  y = int(m / 12); m %= 12
  if (y) print y "y" (m ? " " m "m" : "")
  else if (m) print m "m" (d ? " " d "d" : "")
  else print d "d"
}'
