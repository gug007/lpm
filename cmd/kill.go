package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var killCmd = &cobra.Command{
	Use:   "kill [project]",
	Short: "Stop a running project (all projects if no name given)",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 {
			killAllExcept("")
			return
		}

		name := args[0]
		if err := killProjectSession(name); err != nil {
			fmt.Printf("%s is not running\n", name)
			return
		}
		fmt.Printf("Stopped %s\n", name)
	},
}

func init() {
	killCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(killCmd)
}
