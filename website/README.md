# lpm.cx

The Next.js site for lpm: the homepage, docs, changelog, lessons and comparison
pages. It deploys to Vercel.

## Run it

```bash
pnpm install
npm run dev
```

`npm run dev` starts the site on http://localhost:3000 (set `PORT` for another
port). The first time, it builds the demo app into `public/demo-app` before
starting, installing `desktop/frontend`'s dependencies if they are missing.

## The demos

Every interactive demo on the site is the desktop app's own UI in an iframe.
`desktop/frontend/src/demo` answers its commands from sample data in memory and
plays each page's tour against the real UI. `npm run dev` builds it only when
`public/demo-app` is missing, so after changing the desktop UI or the demo,
rebuild it with `npm run demo-app`. `npm run build` always rebuilds it.

## Scripts

- `npm run dev`: the site, building the demo app first if it's missing
- `npm run build`: rebuild the demo app, then `next build`
- `npm run demo-app`: rebuild `public/demo-app` only
- `npm run lint`: ESLint
- `npm run sitemap:dates`: write each page's last change from git into
  `lib/sitemap-dates.json`
- `node scripts/import-lesson-transcripts.mjs`: copy each lesson's captions into
  `lib/lesson-transcripts.json`

## Where things are

- `app/`: one folder per route
- `components/home/`: the homepage, including the demo frame and its tours
  (`tour.ts`)
- `components/config/` and `components/docs/`: the docs
- `/changelog`: each GitHub release's notes, which `scripts/release.sh` has
  Claude write into the tag; `lib/changelog.json` holds older releases' notes
