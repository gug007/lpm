package main

import (
	"fmt"
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

	selected, err := aigen.Detect(aigen.CLI(cli))
	if err != nil {
		return "", err
	}
	return aigen.GenerateText(a.ctx, selected, cwd, commitMsgPrompt+diff, func(msg string) {
		runtime.EventsEmit(a.ctx, commitMsgProgressEvent, msg)
	})
}

const commitMsgProgressEvent = "commit-msg-progress"

const commitMsgPrompt = `Given the following git diff, write a concise commit message.
Use conventional commit format: type(scope): description
Types: feat, fix, refactor, docs, test, chore, style, perf
Keep the first line under 72 characters.
If needed, add a blank line then a brief body paragraph.
Output ONLY the commit message text. No code fences. No explanation.

`

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
