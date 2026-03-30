package cmd

import "github.com/spf13/cobra"

var switchProfileFlag string

var switchCmd = &cobra.Command{
	Use:   "switch <project>",
	Short: "Kill all running projects and start another",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		target := args[0]
		killAllExcept(target)
		runProject(target, switchProfileFlag, false)
	},
}

func init() {
	switchCmd.Flags().StringVarP(&switchProfileFlag, "profile", "p", "", "profile to use (default: all services)")
	switchCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(switchCmd)
}
