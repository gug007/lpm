package cmd

import (
	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var openCmd = &cobra.Command{
	Use:   "open <project>",
	Short: "Open a running project's terminal session",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]
		if err := tmux.Attach(name); err != nil {
			fatalf("%s is not running. Start it with: lpm %s", name, name)
		}
	},
}

func init() {
	openCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(openCmd)
}
