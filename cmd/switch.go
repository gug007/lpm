package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var switchProfileFlag string

var switchCmd = &cobra.Command{
	Use:   "switch <project>",
	Short: "Kill all running projects and start another",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if err := tmux.EnsureInstalled(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		target := args[0]

		cfg, err := config.LoadProject(target)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		// Kill all running projects except the target
		projects, err := config.ListProjects()
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to list projects: %v\n", err)
			os.Exit(1)
		}
		for _, name := range projects {
			if name != target && tmux.SessionExists(name) {
				if err := tmux.KillSession(name); err != nil {
					fmt.Fprintf(os.Stderr, "failed to kill %s: %v\n", name, err)
					continue
				}
				fmt.Printf("Stopped %s\n", name)
			}
		}

		if err := tmux.StartProject(cfg, switchProfileFlag); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		fmt.Printf("Switched to %s\n", target)

		if err := tmux.Attach(cfg.Name); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	},
}

func init() {
	switchCmd.Flags().StringVarP(&switchProfileFlag, "profile", "p", "", "profile to use (default: all services)")
	switchCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(switchCmd)
}
