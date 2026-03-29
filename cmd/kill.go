package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var killCmd = &cobra.Command{
	Use:   "kill [project]",
	Short: "Stop a running project (all projects if no name given)",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 {
			killAll()
			return
		}

		name := args[0]

		if !tmux.SessionExists(name) {
			fmt.Printf("%s is not running\n", name)
			return
		}

		if err := tmux.KillSession(name); err != nil {
			fmt.Fprintf(os.Stderr, "failed to kill %s: %v\n", name, err)
			os.Exit(1)
		}

		fmt.Printf("Stopped %s\n", name)
	},
}

func killAll() {
	projects, err := config.ListProjects()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to list projects: %v\n", err)
		os.Exit(1)
	}

	stopped := 0
	for _, name := range projects {
		if tmux.SessionExists(name) {
			if err := tmux.KillSession(name); err != nil {
				fmt.Fprintf(os.Stderr, "failed to kill %s: %v\n", name, err)
				continue
			}
			fmt.Printf("Stopped %s\n", name)
			stopped++
		}
	}

	if stopped == 0 {
		fmt.Println("No running projects")
	}
}

func init() {
	killCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(killCmd)
}
