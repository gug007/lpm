package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var version = "0.1.0"

var rootProfileFlag string

var rootCmd = &cobra.Command{
	Use:   "lpm [project]",
	Short: "Local Project Manager — manage and switch between dev projects",
	Long:  "LPM manages local development projects.\nConfigure your projects once, then start/stop them with a single command.\n\nUsage: lpm <project> to start a project in the background.",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 {
			cmd.Help()
			return
		}
		runProject(args[0], rootProfileFlag, false)
	},
}

func init() {
	rootCmd.Flags().StringVarP(&rootProfileFlag, "profile", "p", "", "profile to use (default: all services)")
	rootCmd.ValidArgsFunction = completeProjectNames
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
