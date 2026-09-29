# How a lesson is made

`take.sh` → `preflight.js` → `make.js`: voice → lint → record → cards → mux → edit → captions, chapters, thumbnail → checks.

## Before the take

- `preflight.js [<lesson>] [flags]` sets up what it can by itself: Claude Code's folder trust for the workspace root, the music bed (downloaded from `music/tracks.json`; Mixkit's licence allows it in videos but not in the repo), Playwright's Chromium, the macOS permission prompts, and the two native helpers (text recognition for the checks, the clipboard keeper) built into `~/Library/Caches/lpm-video-lesson`. It lists the rest with the fix and exits 1: the OpenAI key, Screen Recording, Accessibility and Automation (System Events) for the app the take runs in, a locked screen, ffmpeg and cliclick (Homebrew), the Xcode Command Line Tools, the debug app build, Claude Code / Codex sign-in, and lint errors. It notes a debug app older than the Rust sources.
- The lint (`scripts/lint.js`): every narration line has a beat, no line is called `setup`, every literal `cue`/`until`/`cueMs` phrase is in its line (ambiguous or backwards cues are warnings), no TODO placeholders, no teaser line, the opening and closing cards, and a warning for a very short closing sentence.
- `take.sh` saves the user's agent defaults (`guard.js`: `~/.claude/settings.json` model, effortLevel, modelSettings, statusLine; `~/.codex/config.toml` model, model_reasoning_effort and the `[tui]` status_line / status_line_use_colors that lpm's Codex status-line page writes; `~/.cursor/cli-config.json` model keys) into `~/Library/Caches/lpm-video-lesson/`, and the whole clipboard; empties the clipboard, runs the take under `caffeinate`, and afterwards stops the lesson app, its session daemon (services and agents; `--keep-state` keeps them) and the dev server it started, then puts the settings and the clipboard back. A take killed before that is repaired at the start of the next one: the settings are put back (the guard prints each key), and the clipboard too unless something was copied since, in which case the old backup is kept aside. The data directory is checked before anything starts, and only a lesson data directory's daemon is ever stopped. A `--mux-only` re-cut does none of this.

## The recording

- The real desktop app (`desktop/frontend`, the debug build at `src-tauri/target/debug/lpm-desktop`, UI from Vite on :9245, started without file watching when nothing answers there; a running `tauri dev` reloads the app on edits, so close it for a take).
- Its own data directory, `~/.lpm-lessons` (`LPM_LESSON_DIR`, `--lpm-dir <absolute path>`), wiped before every take so each lesson opens like a fresh install; only a directory the skill created (`.lesson-data-dir`) is ever wiped, never `~/.lpm` or its parents. The last Claude usage reading is copied in from `~/.lpm/agent-limits.json` (read only). Demo folders live in `/Users/Shared/lpm-lessons` (`LPM_LESSON_WORKSPACE`).
- Driven through the debug-only lesson control socket (`lesson.rs`): JavaScript in the main webview, the window sized to the frame, centred and always on top, captured by ffmpeg (AVFoundation) as a rectangle of the screen, so anything drawn over it (a system banner, a HUD) is recorded too. Clicks and typing use the real pointer and keyboard (cliclick, System Events) so hover states and native sheets work; the pointer is put back afterwards.
- Takes: every recording gets `_takes/NNN-YYMMDD-HHMM/` with `take.log`, the `lesson.json` and `beats.js` it ran, and while it runs the raw capture and timeline. A finished take replaces the lesson's current one, whose `record.mkv`, `timeline.json`, MP4, captions, chapters, cards and checks move into its own take folder. A failed take is renamed `…-failed` with `error.txt`, `error.jpg` (the screen at that moment) and `timeline.partial.json` (the lines it got through), and the current take is untouched. A dry run (`--no-audio`) keeps only its log, timeline and `frames/`.
- `timeline.json` records the lines, cards, zooms (with ids and targets), warnings (agent misses, re-pressed clicks, focus steals) and `app` (commit, edited frontend files, when the binary was built).

## The picture

- The app window floats centred on the cards' own canvas (`#ebe5d9` with the three pools, still and at half strength), ~82% of the width, rounded corners and a soft shadow that moves with it (`FRAME` in `scripts/stage.js`; composited at mux time by `scripts/compose.js` from the raw capture, over canvas/shadow/mask PNGs cached in `_frame/` beside the lessons).
- The capture is decoded as BT.709 and the master written as limited-range BT.709, tagged so.
- Topic cards: big serif title on the canvas, pools drifting, words rising in one after another; rendered as clips in `cards/` (again whenever `CARD_LOOK` changes) and overlaid at mux time. The opening card hands over in one move: its words lift away, then the card fades while the window rises into place (`OPEN_LIFT` in `scripts/appstage.js`); other cards fade over 300 ms.
- Zooms are `zoompan` keyframes eased over their `ms`; a zoom that starts before the last one has finished eases on from where the picture is (`scripts/keyframes.js`, shared with the vertical camera). Cards never zoom.

## The sound

- One OpenAI speech clip per line (`gpt-4o-mini-tts`, voice `marin`, `DEFAULT_STYLE` in `scripts/make.js`), cached by model, voice and text; a clip keeps its place when only the style changes, because a re-spoken line has a different length. Whisper word onsets land clicks on words; a fresh clip that loses words (a short closing sentence) is spoken again, up to three times, and a clip the take was recorded with is never replaced over it. The transcript's spellings (digits, "cloud" for Claude, "codec" for Codex) are matched to the script.
- The mix (`scripts/mix.js`): clips on their slots at 48 kHz, levelled toward the lesson's median where TTS came back 1.5 LU or more off, the voice's treble shelved onto lesson 02's brightness (−16.5 dB above 4 kHz) so every lesson sounds like the same narrator, the music bed 14 LU under the voice and ducked while lines play, fading in over the title card and out over the end card; then the whole mix mastered to −14 LUFS (YouTube's reference; it never turns a quieter upload up) with a true-peak limiter at −1.5 dBTP, stereo. `--no-music`, `--music <file>` or `"music": false` change the bed.

## The edit

`scripts/edit.js`, after the mux, for viewers who leave in the first seconds or during a wait. With a `coldOpen` the video opens on its shots under the spoken hook, then the opening card and its hand-over (the card's own frames), then the lesson from its second line; the first line's narration is dropped. A stretch of more than 2.5 s with nothing said between two lines, not covered by a card, plays at 4× (up to 16× for long ones) under a canvas-coloured `N×` pill (drawn once into `_frame/`); `"speedUpWaits": false` keeps it real time. The straight render is written nearly lossless (CRF 12, picture only), cut into segments on frame boundaries, each encoded once (BT.709, CRF 18), and joined; the soundtrack is mixed again (same bed, ducking and master) with every clip at its new time. `edit.json` lists the cuts (take time → cut time) and moves with its take; captions, chapters and the checks follow the edited timeline, and the checks report on-screen findings in take time.

## After the mux

- `<slug>.srt`: captions from the script itself, timed by the word onsets (uploaded with the video; YouTube's own recognition writes "LPM", "cloud", "codecs").
- `chapters.txt`: every topic card and every `chapter` line starts one, the first at 0:00; problems (fewer than 3, one under 10 s) are printed.
- `thumbnail.jpg`: with a `cover`, its words beside (or above) a crop of the take at that moment, on the cards' canvas and serif (`scripts/cover.js`); otherwise the opening card drawn still. `thumbnail.json` records what it was drawn from, so a changed cover or a new take draws it again.
- `qa/report.json` and `qa/sheet.jpg` (`scripts/qa.js`, also runnable on its own): the take read once a second for the account name, full name, computer name, email, home path, any email address and error text ("Hook failed", "Transcript saving is off"…), agent misses, dead air over 2.5 s, loudness and true peak, and one frame per line on a sheet. `youtube-upload` refuses a lesson whose report failed or is older than the MP4.

## Re-rendering a published lesson

Everything after the recording can be redone with `--mux-only`: the look, the sound, the zooms, the captions. The render it replaces moves into its take's folder under `cuts/`. Verify on a scratch copy first (`cp -c -R` the folder, `node scripts/make.js <copy> --mux-only`). Uploading the new cut means a new video (see `youtube-upload`).

`--variant <name> --voice <v> --style "<prompt>"` renders the lesson with another voice into `variants/`, to hear a style before adopting it. `scripts/stop-lesson-daemon.sh` stops a lesson app's daemon by hand (take.sh runs it after every take).
