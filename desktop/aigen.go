package main

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gug007/lpm/internal/aigen"
	"github.com/gug007/lpm/internal/config"
)

// Canonical lpm-config skill — the same prompt published at
// lpm-config/SKILL.md so external AI agents and the in-app wizard share one
// source of truth. Keep aiskill/SKILL.md in sync with lpm-config/SKILL.md.
//
//go:generate cp ../lpm-config/SKILL.md ./aiskill/SKILL.md
//go:embed aiskill/SKILL.md
var lpmSkill string

const aiProgressEvent = "ai-generate-output"

type AICLIAvailability struct {
	Claude   bool `json:"claude"`
	Codex    bool `json:"codex"`
	Gemini   bool `json:"gemini"`
	Opencode bool `json:"opencode"`
}

func (a *App) CheckAICLIs() AICLIAvailability {
	avail := aigen.Available()
	return AICLIAvailability{
		Claude:   avail[aigen.CLIClaude],
		Codex:    avail[aigen.CLICodex],
		Gemini:   avail[aigen.CLIGemini],
		Opencode: avail[aigen.CLIOpencode],
	}
}

const maxDiffSize = 30_000

// GenerateCommitMessage generates a commit message from the diff of the given files.
// effort maps to the CLI's reasoning effort flag; "" uses the CLI default.
// fast enables Codex's service_tier=fast; ignored for other CLIs.
func (a *App) GenerateCommitMessage(cwd, cli, model, effort string, fast bool, files []string) (string, error) {
	diff, err := a.GitDiff(cwd, files)
	if err != nil {
		return "", fmt.Errorf("no diff to summarize")
	}
	diff = strings.TrimSpace(diff)
	if diff == "" {
		return "", fmt.Errorf("no diff to summarize")
	}
	if len(diff) > maxDiffSize {
		diff = diff[:maxDiffSize] + "\n... (truncated)"
	}

	prompt := commitMsgPrompt
	if instr, _ := a.ReadCommitInstructions(); instr != "" {
		prompt += "Additional instructions from the user:\n" + instr + "\n\n"
	}

	selected, err := aigen.Detect(aigen.CLI(cli))
	if err != nil {
		return "", err
	}
	return aigen.Run(a.ctx, selected, cwd, prompt+diff, aigen.RunOptions{Model: model, Effort: effort, Fast: fast}, func(msg string) {
		a.wails.Event.Emit(commitMsgProgressEvent, msg)
	})
}

const commitMsgProgressEvent = "commit-msg-progress"

func instructionsPath(name string) string {
	return filepath.Join(config.LpmDir(), name+"-instructions.txt")
}

func readInstructions(name string) (string, error) {
	data, err := os.ReadFile(instructionsPath(name))
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

func saveInstructions(name, content string) error {
	if err := config.EnsureDirs(); err != nil {
		return err
	}
	return os.WriteFile(instructionsPath(name), []byte(content), 0644)
}

func (a *App) ReadCommitInstructions() (string, error) { return readInstructions("commit") }
func (a *App) SaveCommitInstructions(content string) error { return saveInstructions("commit", content) }

const commitMsgPrompt = `Given the following git diff, write a concise commit message.
Use conventional commit format: type(scope): description
Types: feat, fix, refactor, docs, test, chore, style, perf
Keep the first line under 72 characters.
If needed, add a blank line then a brief body paragraph.
Output ONLY the commit message text. No code fences. No explanation.

`

const prTitleProgressEvent = "pr-title-progress"
const prDescriptionProgressEvent = "pr-description-progress"

const prTitlePrompt = `Given the following git diff and commit log from a feature branch, generate a pull request title.

Requirements:
- Keep under 70 characters
- Be descriptive but concise
- Start with a verb (Add, Fix, Update, Refactor, etc.)

Output ONLY the title text. No quotes. No code fences. No explanation.

`

const prDescriptionPrompt = `Given the following git diff and commit log from a feature branch, generate a pull request description.

Requirements:
- Start with a brief summary (2-3 sentences max)
- Include a bulleted list of key changes
- Keep it concise but informative

Output ONLY the description text. No code fences. No explanation.

`

func (a *App) prDiffAndLog(cwd, base string) (diff, commitLog string, err error) {
	diff, err = a.GitDiffBranch(cwd, base)
	if err != nil || strings.TrimSpace(diff) == "" {
		return "", "", fmt.Errorf("no diff to summarize")
	}
	if len(diff) > maxDiffSize {
		diff = diff[:maxDiffSize] + "\n... (truncated)"
	}
	if commits, err := a.GitLogBranch(cwd, base); err == nil {
		var sb strings.Builder
		for _, c := range commits {
			sb.WriteString(c.Hash + " " + c.Subject + "\n")
		}
		commitLog = sb.String()
	}
	return diff, commitLog, nil
}

func buildPRPrompt(base, userInstructions, diff, commitLog string) string {
	prompt := base
	if userInstructions != "" {
		prompt += "Additional instructions from the user:\n" + userInstructions + "\n\n"
	}
	if commitLog != "" {
		prompt += "Commits:\n" + commitLog + "\n"
	}
	prompt += "Diff:\n" + diff
	return prompt
}

func (a *App) GeneratePRTitle(cwd, cli, model, effort string, fast bool, base string) (string, error) {
	diff, commitLog, err := a.prDiffAndLog(cwd, base)
	if err != nil {
		return "", err
	}
	instr, _ := a.ReadPRTitleInstructions()
	prompt := buildPRPrompt(prTitlePrompt, instr, diff, commitLog)

	selected, err := aigen.Detect(aigen.CLI(cli))
	if err != nil {
		return "", err
	}
	return aigen.Run(a.ctx, selected, cwd, prompt, aigen.RunOptions{Model: model, Effort: effort, Fast: fast}, func(msg string) {
		a.wails.Event.Emit(prTitleProgressEvent, msg)
	})
}

func (a *App) GeneratePRDescription(cwd, cli, model, effort string, fast bool, base string) (string, error) {
	diff, commitLog, err := a.prDiffAndLog(cwd, base)
	if err != nil {
		return "", err
	}
	instr, _ := a.ReadPRDescriptionInstructions()
	prompt := buildPRPrompt(prDescriptionPrompt, instr, diff, commitLog)

	selected, err := aigen.Detect(aigen.CLI(cli))
	if err != nil {
		return "", err
	}
	return aigen.Run(a.ctx, selected, cwd, prompt, aigen.RunOptions{Model: model, Effort: effort, Fast: fast}, func(msg string) {
		a.wails.Event.Emit(prDescriptionProgressEvent, msg)
	})
}

func (a *App) ReadPRTitleInstructions() (string, error)       { return readInstructions("pr-title") }
func (a *App) SavePRTitleInstructions(content string) error   { return saveInstructions("pr-title", content) }
func (a *App) ReadPRDescriptionInstructions() (string, error) { return readInstructions("pr-description") }
func (a *App) SavePRDescriptionInstructions(content string) error {
	return saveInstructions("pr-description", content)
}

const branchNameProgressEvent = "branch-name-progress"

// A branch name only needs the shape of the change, not every hunk — keep
// the prompt cheap.
const maxBranchNameDiffSize = 6_000

const branchNamePrompt = `Given the following git diff and commit log, generate a short git branch name.

Requirements:
- Use kebab-case (lowercase words separated by hyphens)
- Keep under 50 characters
- Optionally prefix with a type: feat/, fix/, refactor/, docs/, chore/
- Be descriptive but concise
- No trailing slash, no spaces, no quotes

Output ONLY the branch name. No code fences. No explanation.

`

// GenerateBranchName summarizes uncommitted changes when present, otherwise
// falls back to the current branch diff against the default branch.
func (a *App) GenerateBranchName(cwd, cli, model, effort string, fast bool) (string, error) {
	var commitLog string
	diff, _ := runGit(cwd, "diff", "HEAD")
	diff = strings.TrimSpace(diff)
	if diff == "" {
		if base := a.GitDefaultBranch(cwd); base != "" {
			d, log, err := a.prDiffAndLog(cwd, base)
			if err == nil {
				diff = d
				commitLog = log
			}
		}
	}
	if diff == "" {
		return "", fmt.Errorf("no changes to summarize")
	}
	if len(diff) > maxBranchNameDiffSize {
		diff = diff[:maxBranchNameDiffSize] + "\n... (truncated)"
	}

	instr, _ := a.ReadBranchNameInstructions()
	prompt := buildPRPrompt(branchNamePrompt, instr, diff, commitLog)

	selected, err := aigen.Detect(aigen.CLI(cli))
	if err != nil {
		return "", err
	}
	return aigen.Run(a.ctx, selected, cwd, prompt, aigen.RunOptions{Model: model, Effort: effort, Fast: fast}, func(msg string) {
		a.wails.Event.Emit(branchNameProgressEvent, msg)
	})
}

func (a *App) ReadBranchNameInstructions() (string, error) {
	return readInstructions("branch-name")
}
func (a *App) SaveBranchNameInstructions(content string) error {
	return saveInstructions("branch-name", content)
}

const mergeConflictProgressEvent = "merge-conflict-progress"

const mergeConflictPrompt = `Resolve all unresolved git merge conflict markers (<<<<<<<, =======, >>>>>>>) in the working tree.

Rules:
- Inspect every file currently listed by ` + "`git diff --name-only --diff-filter=U`" + `.
- For each conflict, choose the resolution that keeps both sides' intent when both are additive (e.g. independent imports, distinct icons, separate functions). When the two sides truly conflict on the same logic, pick the side that matches the project's current direction; if unclear, prefer the incoming branch.
- Remove every conflict marker. The final file must contain no <<<<<<<, =======, or >>>>>>> lines.
- After resolving each file run ` + "`git add <file>`" + ` to stage it.
- Do NOT run ` + "`git commit`" + `; the user reviews and commits manually.
- If a file cannot be resolved confidently, leave it alone and report the file path in your final message.

Output ONLY a brief summary of what you changed when done.
`

// ResolveMergeConflictsWithAI runs the chosen AI CLI with file-write
// permissions to resolve every unresolved merge conflict in cwd.
func (a *App) ResolveMergeConflictsWithAI(cwd, cli, model, effort string, fast bool) (string, error) {
	if conflicts := a.GitMergeConflicts(cwd); len(conflicts) == 0 {
		return "", fmt.Errorf("no merge conflicts to resolve")
	}
	selected, err := aigen.Detect(aigen.CLI(cli))
	if err != nil {
		return "", err
	}
	return aigen.Run(a.ctx, selected, cwd, mergeConflictPrompt, aigen.RunOptions{Model: model, Effort: effort, Fast: fast, Writes: true}, func(msg string) {
		a.wails.Event.Emit(mergeConflictProgressEvent, msg)
	})
}

const actionYAMLProgressEvent = "action-yaml-progress"

func projectContextBlock(cfg *config.ProjectConfig) string {
	var b strings.Builder
	b.WriteString("# Project context\n\n")
	b.WriteString("- Name: ")
	b.WriteString(cfg.Name)
	b.WriteString("\n")
	if cfg.IsRemote() && cfg.SSH != nil {
		b.WriteString("- Kind: SSH (remote)\n")
		b.WriteString("- SSH target: ")
		b.WriteString(cfg.SSH.User)
		b.WriteString("@")
		b.WriteString(cfg.SSH.Host)
		if cfg.SSH.Port != 0 && cfg.SSH.Port != 22 {
			b.WriteString(fmt.Sprintf(":%d", cfg.SSH.Port))
		}
		b.WriteString("\n")
		if cfg.SSH.Dir != "" {
			b.WriteString("- Remote working directory: ")
			b.WriteString(cfg.SSH.Dir)
			b.WriteString("\n")
		}
	} else {
		b.WriteString("- Kind: local\n")
		if cfg.Root != "" {
			b.WriteString("- Project root (absolute path): ")
			b.WriteString(cfg.Root)
			b.WriteString("\n")
		}
	}
	b.WriteString("- User-level config file: ")
	b.WriteString(config.ProjectPath(cfg.Name))
	b.WriteString("\n")
	return b.String()
}

// buildActionYAMLPrompt wraps the lpm-config skill with a narrower task:
// produce or modify a single action's YAML body, not a whole config file.
func buildActionYAMLPrompt(cfg *config.ProjectConfig, userPrompt, currentYAML string) string {
	var task strings.Builder
	task.WriteString("# Task\n\n")
	task.WriteString("Produce the YAML body for a SINGLE lpm action (the value of one `actions:` entry), not a whole config file.\n\n")
	task.WriteString("Output rules:\n")
	task.WriteString("- Output ONLY the action's YAML fields at indent 0 — no surrounding `name:` key, no `actions:` wrapper, no code fences, no comments, no prose.\n")
	task.WriteString("- Omit fields you don't need; do not invent fields outside the skill's schema.\n")
	task.WriteString("- Children go under `actions:` with the same field set (no `display:` on children).\n")
	task.WriteString("- The wizard already handles `display:` and `position:` — omit them.\n")
	task.WriteString("- `cwd:` is relative to the project root (or `ssh.dir` for SSH projects). Use relative paths; only use absolute paths when there's a clear reason.\n\n")

	if strings.TrimSpace(currentYAML) == "" {
		task.WriteString("Generate a new action from the user's request below.\n\n")
		task.WriteString("User's request:\n")
		task.WriteString(userPrompt)
		task.WriteString("\n")
	} else {
		task.WriteString("Modify the current action to satisfy the user's instruction. Return the FULL updated YAML body — not a diff. Preserve fields the user didn't ask to change.\n\n")
		task.WriteString("User's instruction:\n")
		task.WriteString(userPrompt)
		task.WriteString("\n\nCurrent action YAML:\n")
		task.WriteString(currentYAML)
		task.WriteString("\n")
	}

	return projectContextBlock(cfg) + "\n# Reference: lpm-config skill\n\n" + lpmSkill + "\n\n" + task.String()
}

// GenerateActionYAML produces or modifies the YAML body for a header action.
// currentYAML may be empty for a fresh action; when non-empty the AI is asked
// to modify it in place.
func (a *App) GenerateActionYAML(projectName, cli, model, effort string, fast bool, userPrompt, currentYAML string) (string, error) {
	userPrompt = strings.TrimSpace(userPrompt)
	if userPrompt == "" {
		return "", fmt.Errorf("describe what the action should do")
	}

	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", err
	}

	prompt := buildActionYAMLPrompt(cfg, userPrompt, currentYAML)

	selected, err := aigen.Detect(aigen.CLI(cli))
	if err != nil {
		return "", err
	}
	return aigen.Run(a.ctx, selected, cfg.Root, prompt, aigen.RunOptions{Model: model, Effort: effort, Fast: fast}, func(msg string) {
		a.wails.Event.Emit(actionYAMLProgressEvent, msg)
	})
}

func (a *App) GenerateProjectConfig(projectName, cli, extraPrompt string) (string, error) {
	cfg, err := config.LoadProject(projectName)
	if err != nil {
		return "", err
	}
	selected, err := aigen.Detect(aigen.CLI(cli))
	if err != nil {
		return "", err
	}
	return aigen.Generate(a.ctx, aigen.Options{
		CLI:         selected,
		ProjectName: cfg.Name,
		ProjectDir:  cfg.Root,
		ExtraPrompt: extraPrompt,
		Progress: func(msg string) {
			a.wails.Event.Emit(aiProgressEvent, msg)
		},
	})
}
