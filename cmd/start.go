package cmd

import (
	"fmt"
	"os"

	"github.com/gug007/lpm/internal/config"
	"github.com/gug007/lpm/internal/tmux"
	"github.com/spf13/cobra"
)

var profileFlag string

var startCmd = &cobra.Command{
	Use:   "start <project>",
	Short: "Start a project and attach to its session",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if err := tmux.EnsureInstalled(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		name := args[0]

		cfg, err := config.LoadProject(name)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		if err := tmux.StartProject(cfg, profileFlag); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		fmt.Printf("Started %s\n", name)

		if err := tmux.Attach(cfg.Name); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	},
}

func init() {
	startCmd.Flags().StringVarP(&profileFlag, "profile", "p", "", "profile to use (default: all services)")
	startCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(startCmd)
}
