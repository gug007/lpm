package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var removeCmd = &cobra.Command{
	Use:     "remove <project>",
	Short:   "Remove a project configuration",
	Aliases: []string{"rm"},
	Args:    cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]
		path := filepath.Join(config.ProjectsDir(), name+".yml")

		if _, err := os.Stat(path); os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "project %q not found\n", name)
			os.Exit(1)
		}

		// Kill session if running
		if tmux.SessionExists(name) {
			tmux.KillSession(name)
			fmt.Printf("Stopped %s\n", name)
		}

		if err := os.Remove(path); err != nil {
			fmt.Fprintf(os.Stderr, "failed to remove %s: %v\n", name, err)
			os.Exit(1)
		}

		fmt.Printf("Removed %s\n", name)
	},
}

func init() {
	rootCmd.AddCommand(removeCmd)
}
