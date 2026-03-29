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
			fmt.Println("No projects configured. Use 'lpm init' to add one.")
			return
		}

		for _, name := range projects {
			if tmux.SessionExists(name) {
				fmt.Printf("  %-20s %s● running%s\n", name, colorGreen, colorReset)
			} else {
				fmt.Printf("  %-20s %s○ stopped%s\n", name, colorDim, colorReset)
			}
		}
	},
}

func init() {
	rootCmd.AddCommand(listCmd)
}
