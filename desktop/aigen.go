package main

import (
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
