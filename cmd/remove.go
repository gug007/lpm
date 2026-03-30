package cmd

import (
	"fmt"
	"os"

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
		if err := config.ValidateName(name); err != nil {
			fatal(err)
		}
		path := config.ProjectPath(name)

		tmux.KillSession(name)

		if err := os.Remove(path); err != nil {
			if os.IsNotExist(err) {
				fatalf("project %q not found", name)
			}
			fatalf("failed to remove %s: %v", name, err)
		}

		fmt.Printf("Removed %s\n", name)
	},
}

func init() {
	removeCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(removeCmd)
}
