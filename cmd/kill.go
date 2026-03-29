package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var killCmd = &cobra.Command{
	Use:   "kill <project>",
	Short: "Stop a running project",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
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

func init() {
	rootCmd.AddCommand(killCmd)
}
