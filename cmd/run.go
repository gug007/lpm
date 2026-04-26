package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"

	"github.com/gug007/lpm/internal/config"
	"github.com/spf13/cobra"
)

var runCmd = &cobra.Command{
	Use:   "run <project> <action>",
	Short: "Run a project action",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		projectName := args[0]
		actionName := args[1]

		cfg, err := config.LoadProject(projectName)
		if err != nil {
			fatal(err)
		}

		action, ok := cfg.Actions[actionName]
		if !ok {
			var available []string
			for name := range cfg.Actions {
				available = append(available, name)
			}
			sort.Strings(available)
			if len(available) == 0 {
				fatalf("project %q has no actions defined", projectName)
			}
			fatalf("action %q not found in project %q\nAvailable actions: %s", actionName, projectName, strings.Join(available, ", "))
		}

		cwd := config.ResolveCwd(cfg.Root, action.Cwd)

		cmdStr := action.Cmd
		if len(action.Env) > 0 {
			var parts []string
			for k, v := range action.Env {
				parts = append(parts, fmt.Sprintf("export %s=%s", k, config.ShellQuote(v)))
			}
			parts = append(parts, cmdStr)
			cmdStr = strings.Join(parts, " && ")
		}

		c := exec.Command("/bin/sh", "-c", cmdStr)
		c.Dir = cwd
		c.Stdin = os.Stdin
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr

		if err := c.Run(); err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				os.Exit(exitErr.ExitCode())
			}
			fatal(err)
		}
	},
}

func completeActionNames(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	if len(args) == 0 {
		return completeProjectNames(cmd, args, toComplete)
	}
	if len(args) == 1 {
		cfg, err := config.LoadProject(args[0])
		if err != nil {
			return nil, cobra.ShellCompDirectiveError
		}
		var names []string
		for name := range cfg.Actions {
			names = append(names, name)
		}
		sort.Strings(names)
		return names, cobra.ShellCompDirectiveNoFileComp
	}
	return nil, cobra.ShellCompDirectiveNoFileComp
}

func init() {
	runCmd.ValidArgsFunction = completeActionNames
	rootCmd.AddCommand(runCmd)
}
