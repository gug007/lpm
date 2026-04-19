# /git-terminal-for-mac — Content & Copy Plan

Page route: `/git-terminal-for-mac`
Target primary keyword: **git terminal for mac**
Intent: git-workflow-first — Mac developers who live in git all day (branching, rebasing, resolving conflicts, watching CI, managing PRs) and want a terminal that treats git as a first-class workflow alongside their dev servers.

**Angle:** git-centric. Do NOT recycle the "native / Apple Silicon / battery" angle (that's /best-terminal-for-mac) and do NOT recycle the "monorepo / multi-service / AI agents" angle (that's /mac-terminal-for-developers). The git angle is distinct — this page is about developers who think in branches and commits and want their terminal to keep up.

---

## 1. Metadata

```ts
title: "Git Terminal for Mac — Branch, Rebase, and Ship Faster"
// 58 chars

description: "lpm is the git terminal for Mac developers — run git workflows alongside your dev servers in one native window, watch CI logs, and never lose branch context again."
// 163 chars

keywords: [
  "git terminal for mac",
  "git terminal mac",
  "best git terminal for mac",
  "mac terminal for git",
  "git terminal macos",
  "terminal git workflow mac",
  "mac git client terminal",
  "git rebase terminal mac",
  "git branching terminal mac",
  "git terminal vs gui mac",
  "gitkraken alternative mac",
  "sourcetree alternative mac",
  "tower git alternative mac",
  "iterm2 git workflow",
  "mac terminal for github",
  "terminal git and dev server mac",
  "git pr workflow terminal mac",
  "mac terminal branch switching",
  "lpm",
  "local project manager"
]

alternates.canonical: "/git-terminal-for-mac"

openGraph.title: "Git Terminal for Mac — Branch, Rebase, and Ship Faster"
openGraph.description: "Run every git workflow alongside your dev servers in one native Mac window. No context switching between a GUI git client and a separate terminal."
openGraph.type: "website"
openGraph.url: "/git-terminal-for-mac"
openGraph.siteName: "lpm"

twitter.card: "summary_large_image"
twitter.title: "Git Terminal for Mac — Branch, Rebase, and Ship Faster"
twitter.description: "The Mac terminal that keeps your git workflow and your dev servers in the same window. Branch, rebase, watch CI — without ever leaving lpm."
```

---

## 2. Section outlines

Eight sections, rendered in this order:
`Hero → Problem → Features → Benefits → Workflows → Comparison → Faq → Cta`

**Note for infra-engineer:** The second section is named `Problem` (same as mac-terminal-for-developers). Component file should be `_components/problem.tsx` and the import name `Problem`. All other section names match the sibling pages.

### Hero
- **eyebrow:** `THE GIT TERMINAL FOR MAC DEVELOPERS`
- **H1:** see §3
- **subtitle:** see §3
- **primary CTA:** see §3
- **secondary link:** see §3
- **Git angle:** Running git in a terminal that also runs your dev servers means you stay in one window from first commit to merged PR. No toggling between GitKraken and a separate terminal tab.

### Problem — "Your git workflow and your dev servers are in separate windows"
- **eyebrow:** `THE GIT CONTEXT TAX`
- **H2 title:** `Your git workflow lives in a different window from everything else`
- **subtitle:** Every branch switch, rebase, and PR review means leaving your running services to find the right terminal tab. That gap costs more than you think.
- **Three problem cards (with icon + title + body):**

  1. **You context-switch between a GUI git client and a terminal constantly**
     GitKraken shows you the branch graph. SourceTree shows you the diff. But neither one runs your dev server, so you still flip to a terminal for every `npm run dev` or `rails s`. You end up with three windows open to do the work of one.

  2. **Branch switching mid-session kills your running services**
     You're debugging on `feature/auth-refactor` with three services streaming logs. A colleague asks for a quick review on `main`. You switch branches and your running servers either break or need a full restart. By the time you're back on your original branch, you've lost the thread entirely.

  3. **CI logs are somewhere else entirely**
     Your pull request CI is running on GitHub Actions. Your local terminal is somewhere else. Watching a CI job means opening a browser tab, refreshing manually, or setting up a separate CLI tool — none of which is where your code is.

### Features — "What a git-first terminal looks like"
- **eyebrow:** `GIT IN YOUR TERMINAL, NOT A SEPARATE APP`
- **H2 title:** `A terminal that keeps git and your dev servers in the same window`
- **subtitle:** Six capabilities that change how git feels when your terminal understands your whole workflow.
- **Feature cards (icon + title + body):**

  1. **icon:** `GitBranch` — **Branch in one pane, serve in another**
     Open a shell pane for your git workflow right next to your running service panes. Run `git rebase -i`, resolve conflicts, and push — while your dev server never stops streaming. Everything lives in the same native Mac window.

  2. **icon:** `FolderKanban` — **Per-project git context, always intact**
     Every project has its own persistent workspace. Switch to another repo mid-session and your first project keeps its branch, its running services, and its terminal history. Switch back and nothing has changed.

  3. **icon:** `GitPullRequest` — **One window from commit to merged PR**
     Write code, stage hunks, push the branch, and watch CI output — all in panes inside a single lpm window. You no longer need a GUI git client for the overview and a terminal for the commands. The terminal is the overview.

  4. **icon:** `Layers` — **Keep services running across branch switches**
     lpm project workspaces are branch-agnostic by default. Your dev server does not care that you checked out a new branch — it keeps running unless you explicitly restart it. Reviewable changes, uninterrupted services.

  5. **icon:** `Zap` — **One-click stack restart after a big rebase**
     After a rebase that touches dependencies or migrations, one click stops and restarts your entire defined stack in the correct order. No manual `npm install && rails db:migrate && npm run dev` typed from memory.

  6. **icon:** `Eye` — **Watch every service log while you git**
     While you run `git bisect` or step through a conflict resolution, the service log panes stay live beside your shell. You can see if a change you just pulled broke the API before you even finish the rebase.

### Benefits — "What changes when git and your terminal are the same tool"
- **eyebrow:** `THE GIT WORKFLOW DIFFERENCE`
- **H2 title:** `What git feels like when your terminal is built for it`
- **subtitle:** Four concrete improvements to your daily git workflow.
- **Numbered outcomes:**

  1. **You stop losing your dev server every time you switch branches.** Services run in their own panes, independent of which branch your shell is on. Your `npm run dev` keeps streaming while you rebase, resolve conflicts, and push.

  2. **You stop toggling between a GUI git client and a terminal.** One lpm window has a shell pane for `git` commands and service panes for your running stack. The branch graph GUI is for people who don't want to type — you do want to type, you just don't want to leave your running services to do it.

  3. **Context switching between repos stops wiping your git state.** Jump to another project, fix a blocking bug, push it — your original project is still on its branch, with its services up, with its terminal history intact. Come back and keep rebasing.

  4. **Starting fresh after a big merge is one click, not a script.** After pulling a release branch or merging a long-running feature, lpm restarts the full defined stack in order. No mental dependency graph, no `--force-recreate` flags typed from memory.

### Workflows — "Real git workflows on Mac, solved"
- **eyebrow:** `IN PRACTICE`
- **H2 title:** `Git workflows your Mac terminal should actually support`
- **subtitle:** Three scenarios where a split between your git tool and your terminal costs real time — and how lpm collapses them into one window.
- **Numbered workflows:**

  1. **Rebase a feature branch without stopping your local stack**
     You have an API, a worker, and a Next.js dev server running. A PR review comes back: rebase onto main before merge. Open a shell pane next to your service panes, run `git fetch && git rebase origin/main`, resolve any conflicts, and push. The services never stopped. The log panes kept streaming the whole time. You close the shell pane and keep developing.

  2. **Review and merge a colleague's PR without losing your branch**
     Your team lead asks for a quick review on a branch you haven't touched. Open a second project workspace pointing at the same repo, `git checkout` the review branch, start just the services you need to test the change, leave a comment, merge, and switch back to your workspace. Your original branch, its running services, and your open shell sessions are all still there.

  3. **Ship a hotfix from the same terminal you develop in**
     Production is down. You `git stash`, `git checkout main`, `git pull`, fix the issue, run the test suite in a shell pane while your local API keeps running in its pane, push, tag, and deploy — never leaving lpm. No "where's my terminal that has production credentials loaded" hunting. It's the same shell, same project, same window.

### Comparison — "lpm vs other git tools and terminals on Mac"
- **eyebrow:** `HOW IT COMPARES`
- **H2 title:** `lpm vs GitKraken, iTerm2, Terminal.app, tmux, and SourceTree`
- **subtitle:** A capability matrix for Mac developers choosing between a GUI git client, a terminal multiplexer, and a dev-workflow terminal.
- See full matrix in §4.

### FAQ — "Git terminal questions for Mac, answered"
- **eyebrow:** `FAQ`
- **H2 title:** `What Mac developers ask about terminal git workflows`
- **subtitle:** (none — the questions carry the section)
- See full Q&A in §5.

### CTA — "One window for git and everything else"
- **eyebrow:** (none, large hero-style CTA)
- **H2 title:** `Your git workflow and your dev server, finally in the same window.` / `Free, native, and ready in two minutes.`
- **subtitle:** Download a native macOS binary, drag to Applications, open your first project. lpm puts a git shell pane next to your running service panes — and keeps them running when you switch branches. Works on every Intel and Apple Silicon Mac running macOS 12 or later.
- **Primary CTA:** `Download for macOS` (uses existing `HeroDownload` component)
- **Secondary link:** `View on GitHub →`

---

## 3. Hero-specific

- **Eyebrow:** `THE GIT TERMINAL FOR MAC DEVELOPERS`
- **H1:** `The Mac terminal that keeps git and your dev servers in the same window.`
- **Subtitle paragraph:** lpm gives you a shell pane for branching, rebasing, and pushing right next to live service log panes — so you never toggle between a GUI git client and a separate terminal again. Native Apple Silicon, zero Electron.
- **Primary CTA label:** `Download for macOS` (uses existing `HeroDownload`)
- **Secondary link label:** `View on GitHub`

---

## 4. Comparison matrix

Columns (left-to-right):
`lpm | GitKraken | iTerm2 | Terminal.app | tmux | SourceTree`

Rows (Capability → boolean per column):

| Capability | lpm | GitKraken | iTerm2 | Terminal.app | tmux | SourceTree |
|---|---|---|---|---|---|---|
| Run git commands and dev servers in the same window | true | false | false | false | true | false |
| Services keep running across branch switches | true | false | false | false | true | false |
| Per-project persistent workspace with branch context | true | false | false | false | false | false |
| Visual per-service log panes alongside git shell | true | false | false | false | true | false |
| One-click full-stack restart after rebase or merge | true | false | false | false | false | false |
| Auto-detects Rails, Next.js, Go, Django, Flask, Docker Compose | true | false | false | false | false | false |
| Switch between repos without losing running services | true | false | false | false | false | false |
| Free and open source | true | false | true | true | true | false |

Notes for the engineer:
- Keep lpm column visually highlighted (same treatment as the existing comparison component).
- Use `Check` / `X` icons from `lucide-react`.
- Mobile view: per-alternative card list, identical to the existing comparison's responsive pattern.
- GitKraken and SourceTree are GUI git clients — the comparison reinforces the "terminal git vs GUI git" narrative. Keep their column headers concise.

---

## 5. FAQ (6 Q&A, plain text for JSON-LD)

1. **Q:** Can I use lpm as my primary git terminal on Mac?
   **A:** Yes. lpm panes are real terminal sessions running your default shell — zsh, bash, or fish — with your full dotfile configuration loaded. Every git command, alias, and credential helper works exactly as it does in Terminal.app or iTerm2. You get a shell pane for git right next to your running service panes, all in one native Mac window.

2. **Q:** Does lpm replace a GUI git client like GitKraken or SourceTree?
   **A:** For developers who prefer typing git commands, yes. lpm does not show a visual branch graph — it gives you a real shell where you run `git log --oneline --graph`, `git rebase -i`, and `git push` as you normally would, while your dev servers keep streaming in adjacent panes. If you rely on a click-to-cherry-pick GUI, you can still run GitKraken alongside lpm, but most terminal-first developers find the shell pane is all they need.

3. **Q:** Will my dev server stop running when I switch git branches inside lpm?
   **A:** No. Service panes in lpm run independently of which branch your shell is on. When you `git checkout feature/xyz` in a shell pane, the service panes keep streaming. If a branch change requires a dependency install or a migration, you control when to restart services — lpm won't restart them behind your back.

4. **Q:** How does lpm help with PR review workflows on Mac?
   **A:** You can open a second lpm workspace pointed at the same repo, check out the review branch there, start just the services you need, test the change, and switch back to your main workspace — all within lpm. Your original branch, its running services, and your terminal history are exactly as you left them.

5. **Q:** Can I run `git bisect` or long-running git operations inside lpm?
   **A:** Yes. A shell pane in lpm is a full terminal session — `git bisect`, `git rebase -i`, `git filter-branch`, and any other long-running git operation runs exactly as it would in iTerm2 or Terminal.app. The other service panes keep running alongside it so you can see the effect of each bisect step on your live stack.

6. **Q:** Is lpm a good terminal for Mac developers who use GitHub CLI (`gh`)?
   **A:** Yes. lpm shell panes run your full shell configuration, so `gh pr create`, `gh pr checkout`, `gh run watch`, and any other GitHub CLI command work with your existing auth and aliases. Run `gh run watch` in a shell pane while your dev server streams in the next pane — you get CI output and local output in the same window without a browser tab.

---

## Notes for engineers copying this file

### Component filenames and section names

The second section is **`Problem`** (matching mac-terminal-for-developers, not `WhyMac` as in best-terminal-for-mac). Use:
- Component file: `_components/problem.tsx`
- Import name: `Problem`

All other components follow the same names as the sibling pages:
- `_components/hero.tsx` → `Hero`
- `_components/features.tsx` → `Features`
- `_components/benefits.tsx` → `Benefits`
- `_components/workflows.tsx` → `Workflows`
- `_components/comparison.tsx` → `Comparison`
- `_components/faq.tsx` → `Faq`
- `_components/cta.tsx` → `Cta`

Page render order: `Hero → Problem → Features → Benefits → Workflows → Comparison → Faq → Cta`

### Comparison matrix deviation

The comparison columns differ from both sibling pages. The alternatives are **GitKraken, iTerm2, Terminal.app, tmux, SourceTree** — two are GUI git clients (GitKraken, SourceTree), reinforcing the terminal-git vs GUI-git narrative. Column headers in the matrix: `GitKraken`, `iTerm2`, `Terminal.app`, `tmux`, `SourceTree`.

### Path constant

- Path constant name suggestion: `GIT_TERMINAL_MAC_PATH` in `@/lib/links`
- Canonical URL: `/git-terminal-for-mac`

### Other notes

- All copy above is plain prose. No TSX — render inside the existing `SectionHeader`, `FeatureCard`, `HeroDownload`, comparison table, and FAQ details patterns used by the sibling pages.
- Icon names listed per Feature card are suggestions from `lucide-react` — `GitPullRequest` and `Layers` are additions for this page; swap if a closer match exists in the project's icon set.
- For FAQ JSON-LD: answers are already plain text, so `typeof answer === "string"` works and no `answerText` override is needed.
- Add the new route to the sitemap and to the shared nav/link constants following the pattern used for `MAC_TERMINAL_DEVELOPERS_PATH` in `@/lib/links`.
- Keep the `lpm` column highlighted in the comparison matrix and lead with lpm-differentiator rows (as ordered above).
