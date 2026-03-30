package cmd

import (
	"fmt"

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
		target := args[0]

		projects, err := config.ListProjects()
		if err != nil {
			fatal(err)
		}
		for _, name := range projects {
			if name != target {
				if err := tmux.KillSession(name); err == nil {
					fmt.Printf("Stopped %s\n", name)
				}
			}
		}

		runProject(target, switchProfileFlag, false)
	},
}

func init() {
	switchCmd.Flags().StringVarP(&switchProfileFlag, "profile", "p", "", "profile to use (default: all services)")
	switchCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(switchCmd)
}
