package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List all configured projects",
	Aliases: []string{"ls"},
	Run: func(cmd *cobra.Command, args []string) {
		projects, err := config.ListProjects()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		if len(projects) == 0 {
			fmt.Println("No projects configured. Use 'lpm add' to add one.")
			return
		}

		for _, name := range projects {
			status := "stopped"
			if tmux.SessionExists(name) {
				status = "running"
			}
			fmt.Printf("  %-20s %s\n", name, status)
		}
	},
}

func init() {
	rootCmd.AddCommand(listCmd)
}
