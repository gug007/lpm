package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var openCmd = &cobra.Command{
	Use:   "open <project>",
	Short: "Open a running project's tmux session",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		name := args[0]

		if !tmux.SessionExists(name) {
			fmt.Fprintf(os.Stderr, "%s is not running. Start it with: lpm %s\n", name, name)
			os.Exit(1)
		}

		if err := tmux.Attach(name); err != nil {
			fmt.Fprintf(os.Stderr, "failed to open %s: %v\n", name, err)
			os.Exit(1)
		}
	},
}

func init() {
	openCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(openCmd)
}
