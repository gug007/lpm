package cmd

import "os"

var (
	colorGreen = "\033[32m"
	colorCyan  = "\033[36m"
	colorBold  = "\033[1m"
	colorDim   = "\033[2m"
	colorReset = "\033[0m"
)

func init() {
	if fi, _ := os.Stdout.Stat(); fi != nil && (fi.Mode()&os.ModeCharDevice) == 0 {
		colorGreen, colorCyan, colorBold, colorDim, colorReset = "", "", "", "", ""
	}
}
