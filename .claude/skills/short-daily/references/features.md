# Feature concepts

SOURCE features shows one thing lpm can do a day. `STATE/concepts.json` is its list: ten `open` concepts the user picks from, and a `reserve` to refill from. Nothing is written, voiced or recorded before the pick.

## Keep ten open

1. Mark a concept `made` with its slug once it's in `SHORTS.md` or a ledger, and `dropped` with the reason when the user turns it down. On a day the user picks another one, add 1 to each other concept's `passed`; at 5, drop it. A day with no answer counts for nothing.
2. Refill to ten from the reserve and your own ideas. No two show the same feature, and none repeats a short in `SHORTS.md`.
3. Put the ones the user named in their own words first, then rank by the numbers: `videos.json` and the weekly gains in `views.jsonl`. Limits, accounts and effort have lasted; small conveniences mostly stayed under 300 views.

## A concept qualifies when

- **Viewers can install it.** The commit that added it is in a release (`git tag --contains <commit>`), nothing in its code is marked `@deprecated`, and you read in the code what it does and what its buttons say.
- **The run can record it alone:** the desktop app with `--dom-mouse`. No phone, second computer, server, microphone or real GitHub, and no click inside a web page in lpm's browser or a mini app.
- **The result shows in the first second, muted.**
- **Nothing on screen is the user's own.** Usage, accounts and history are demo data, and the caption says sample numbers when a number is the point.

## The hook

- One sentence said in under 2.5 s, eight words at most: a problem they've had, a surprise, or a result. It makes sense to someone who has never heard of lpm.
- Say Claude or ChatGPT. Never the feature's name, "In this video" or "Here's how".
- The payoff is on screen under it, and the second line gives a reason to stay.
- It has to be true of the take. If the recording doesn't bear it out, reword the hook before posting.

## Ask

The form goes through a file, so quotes in the hooks stay as written. The ten options and Skip are the whole list (lpm allows 12):

```
lpm ask --form - --timeout <minutes>m < <scratchpad>/ask.json
```

```json
{"questions":[{"type":"choice","other":true,
 "text":"Which lpm short should I make? A pick records it and posts it to YouTube and TikTok with no more questions. To only make one, answer in your own words, like \"3, don't post\".",
 "options":[{"label":"1. \"<hook>\" (<feature>)","description":"<what the viewer sees, and why this one>"},
            {"label":"Skip today"}]}]}
```

Labels stay under 120 characters. The final message lists all ten: number, feature, hook, what the viewer sees. Record the pick's expected views in `features.json`, as SOURCE research does.

With "don't post", stop at `made` and report the MP4's full path.
