package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("lpm v%s\n", version)
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
