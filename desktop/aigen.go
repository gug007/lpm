package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/gug007/lpm/internal/aigen"
	"github.com/gug007/lpm/internal/config"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

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

// GenerateCommitMessage uses an AI CLI to generate a commit message from the
// diff of the given files.
func (a *App) GenerateCommitMessage(cwd, cli string, files []string) (string, error) {
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
	return aigen.GenerateText(a.ctx, selected, cwd, prompt+diff, func(msg string) {
		runtime.EventsEmit(a.ctx, commitMsgProgressEvent, msg)
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

// prDiffAndLog returns the truncated diff and commit log for the branch.
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

// GeneratePRTitle uses an AI CLI to generate a PR title from the branch diff.
func (a *App) GeneratePRTitle(cwd, cli, base string) (string, error) {
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
	return aigen.GenerateText(a.ctx, selected, cwd, prompt, func(msg string) {
		runtime.EventsEmit(a.ctx, prTitleProgressEvent, msg)
	})
}

// GeneratePRDescription uses an AI CLI to generate a PR description from the branch diff.
func (a *App) GeneratePRDescription(cwd, cli, base string) (string, error) {
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
	return aigen.GenerateText(a.ctx, selected, cwd, prompt, func(msg string) {
		runtime.EventsEmit(a.ctx, prDescriptionProgressEvent, msg)
	})
}

func (a *App) ReadPRTitleInstructions() (string, error)       { return readInstructions("pr-title") }
func (a *App) SavePRTitleInstructions(content string) error   { return saveInstructions("pr-title", content) }
func (a *App) ReadPRDescriptionInstructions() (string, error) { return readInstructions("pr-description") }
func (a *App) SavePRDescriptionInstructions(content string) error {
	return saveInstructions("pr-description", content)
}

// GenerateProjectConfig runs the CLI in the project root and streams progress
// lines to the frontend via the aiProgressEvent event.
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
			runtime.EventsEmit(a.ctx, aiProgressEvent, msg)
		},
	})
}
