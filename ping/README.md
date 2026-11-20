# lpm usage ping

Counts how many computers use the lpm desktop app each day, week and month,
without telling them apart. A Cloudflare Worker with one D1 table of daily
totals, served at `https://lpm-ping.lpm-share-relay.workers.dev/ping`.

## How it works

- On the first window focus of each UTC day, lpm sends one
  `GET /ping?v=&os=&arch=&kind=&w=&m=&new=&cohort=` (`dailyping.rs`). A headless
  Linux host sends one on each day it runs, with `kind=host`.
- There is no ID. The app decides the flags: `w=1` on its first ping of an ISO
  week, `m=1` on its first of a calendar month, `new=1` on its first ping ever,
  if lpm was installed in the last 3 days. `cohort` is the month lpm was
  installed.
- The Worker checks every field, then adds the ping to one row per day, version,
  OS, processor, kind and cohort (`migrations/`, `src/queries.ts`). The ping
  itself is not stored. The address it came from only keys a rate limit of 10 a
  minute, and logs are off.
- So daily users are the sum of `daily` for a day, weekly users the sum of
  `weekly` over Monday to Sunday, and monthly users the sum of `monthly` over a
  month. `test/counts.test.mjs` checks that those sums equal the number of
  distinct computers.

The app only sends pings when it was built with `LPM_PING_URL` (the release
workflow takes it from the repository variable of that name) and while the
owner leaves Settings › General › Send daily usage ping on.

## Read the numbers

```sh
npx wrangler login
npm run report        # daily, weekly and monthly active computers, by OS
```

## Develop

```sh
npm install
npm run dev           # the Worker at http://127.0.0.1:8788, with a local database
npm run report -- --local
npm test
npm run typecheck
```

Build lpm with `LPM_PING_URL=http://127.0.0.1:8788/ping` to point it here. A
build with that setting pings on the first focus of each day, so to send another
one, delete `daily-ping.json` from its data folder and restart it.

## Deploy

Pushing a change under `ping/` to main deploys it (`.github/workflows/ping.yml`).
The first time, create the database and put its id in `wrangler.jsonc`:

```sh
npx wrangler login
npx wrangler d1 create lpm-ping
npm run deploy
```

Then set the repository variable `LPM_PING_URL` to
`https://lpm-ping.lpm-share-relay.workers.dev/ping`, and the next release starts
pinging. Without the variable, releases send nothing.

It runs on the account's free `workers.dev` address, for the same reason as
`relay/`: lpm.cx's DNS is on Vercel. The free plan takes 100,000 requests and
100,000 row writes a day, which is one ping per computer per day.
