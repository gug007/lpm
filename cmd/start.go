package cmd

import "github.com/spf13/cobra"

var profileFlag string

var startCmd = &cobra.Command{
	Use:   "start <project>",
	Short: "Start a project and open terminal",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		runProject(args[0], profileFlag, true)
	},
}

func init() {
	startCmd.Flags().StringVarP(&profileFlag, "profile", "p", "", "profile to use (default: all services)")
	startCmd.ValidArgsFunction = completeProjectNames
	rootCmd.AddCommand(startCmd)
}
