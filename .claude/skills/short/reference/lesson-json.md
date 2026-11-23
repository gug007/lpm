# lesson.json

```json
{
  "title": "Claude Code statusline: see your usage limits live",
  "window": { "w": 860, "h": 1040 },
  "open": 2,
  "narration": [
    { "id": "hook", "text": "Stop guessing your Claude limits.", "headline": "Claude limits, right under your prompt 👀" },
    { "id": "tease", "text": "One setting shows them *live*." },
    { "id": "settings", "text": "In lpm, open More. Pick *Settings*.", "label": "Open Settings" },
    { "id": "wrap", "text": "Now you'll see a limit *coming*." }
  ],
  "post": { "caption": "…", "hashtags": ["claude", "claudecode", "aicoding", "devtools", "lpm"] }
}
```

| Field | What it does |
| --- | --- |
| `narration` | `[{ id, text, label?, headline?, caption? }]`, one beat per id. A line without `text` is a silent pause of `ms`. `label` is the step sticker until the next one, `caption: false` speaks a line with nothing written over its shot. No line is called `setup` |
| `open` | How many lines play over the payoff (default 1; use 2). With 2 or more, only the last may do slow setup in its beat |
| `headline` | The cover text, on the first line or here. `headlineMs` takes it down early |
| `window` | The app window in points (default 820×1040; the display caps the height). 860 fits Claude Code's status line, 960 the Settings account rows |
| `post` | `{ caption, hashtags }`, written to `post.txt` |
| `cta` | The end sticker (default `lpm.cx`, `false` for none) |
| `zooms` | Changes to recorded camera moves by the id the log, the sheet and `cut.json` give, applied with `--mux-only`: `{ "ask#1": { "scale": 1.5, "at": [0.3, 0.5], "ms": 400, "by": -200, "drop": true } }`. `at` re-aims inside the recorded target, `ms` keeps the end, `by` shifts it in ms |
| `keys` | `false` leaves out the keycap badges |
| `speedUpWaits` | `false` leaves silences between lines in real time |
| `tempo` | How much faster a clip plays than it was spoken (1.08, pitch kept) |
| `slam` | `{ a, b, colors? }`: two names slammed in over the dimmed payoff (short-race), the headline over them until 1.8 s |
| `windowShiftY`, `stickerTop`, `slamTop` | Where the wide shot's window sits, the stickers' top (270) and the names' top (470) |

`voice`, `style`, `heard`, `pronounce`, `hide`, `music`, `settings`, `env`, `limits` and `claudeStatusLine` are as in [lesson](../../lesson/reference/beats-api.md). A voice NOTE gives the `heard` entry to add; a new model name usually needs one.

What only the render reads never needs a new recording: the keys of `RENDER_ONLY` in `scripts/dryrun.js`, and a line's `label`, `headline` and `caption`.

## Flags

`take.sh <flags>`: `--speak-only`, `--no-audio`, `--mux-only` (with `--speak` to voice a reworded line and keep it only if it fits), `--fresh`, `--respeak` (voice every line again), `--dom-mouse` (no real pointer), `--keep-state`, `--no-music`, `--no-qa`.

## Output

`<slug>.mp4` (H.264 High, 30 fps, AAC 48 kHz), `cover.jpg` (the opening with its headline and no caption), `post.txt`, `sheet.jpg`, `qa/report.json`, `cut.json` (the edit, the camera moves with their ids, the text track, the cut's checks), `frames/` (the raw window at each line's end), `_takes/` (every take, dry run and replaced render).

The checks: names, email addresses, `hide` terms and error text on screen; agents that never answered, clicks pressed twice, pointer cues over 0.3 s late; the hook, the length, dead air over 1.5 s, stretches over 4 s where nothing moves, camera moves that miss their word, push-ins that crop their target; words the voice skipped; loudness.
