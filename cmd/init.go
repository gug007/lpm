package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"


	"github.com/gug007/lpm/internal/config"
	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init [name]",
	Short: "Initialize a new project from the current directory",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		cwd, err := os.Getwd()
		if err != nil {
			fatal(err)
		}

		name := filepath.Base(cwd)
		if len(args) > 0 {
			name = args[0]
		}

		existing := config.ProjectPath(name)
		if _, err := os.Stat(existing); err == nil {
			fatalf("project %q already exists. Edit with: lpm edit %s", name, name)
		}

		cfg := &config.ProjectConfig{
			Name:     name,
			Root:     cwd,
			Services: detectServices(cwd),
		}

		if len(cfg.Services) == 0 {
			fmt.Println("No services detected. Adding a default service.")
			cfg.Services = map[string]config.Service{
				"app": {Cmd: "echo 'edit ~/.lpm/projects/" + name + ".yml to configure'"},
			}
		} else {
			fmt.Println("Detected services:")
			for svcName, svc := range cfg.Services {
				fmt.Printf("  %-15s %s\n", svcName, svc.Cmd)
			}
		}

		reader := bufio.NewReader(os.Stdin)
		fmt.Printf("\nCreate project %q? [Y/n] ", name)
		answer, _ := reader.ReadString('\n')
		answer = strings.TrimSpace(strings.ToLower(answer))
		if answer != "" && answer != "y" && answer != "yes" {
			fmt.Println("Cancelled.")
			return
		}

		if err := config.SaveProject(cfg); err != nil {
			fatal(err)
		}

		fmt.Printf("Created %s\n", existing)
		fmt.Printf("Start with: lpm %s\n", name)
	},
}

func detectServices(dir string) map[string]config.Service {
	services := make(map[string]config.Service)

	// Rails
	if fileExists(filepath.Join(dir, "Gemfile")) && dirExists(filepath.Join(dir, "app")) {
		services["rails"] = config.Service{Cmd: "rails s"}
		if fileExists(filepath.Join(dir, "config/sidekiq.yml")) {
			services["sidekiq"] = config.Service{Cmd: "bundle exec sidekiq"}
		}
	}

	// Node/frontend
	if fileExists(filepath.Join(dir, "package.json")) {
		pkg, err := os.ReadFile(filepath.Join(dir, "package.json"))
		if err == nil {
			content := string(pkg)
			switch {
			case strings.Contains(content, "\"next"):
				services["frontend"] = config.Service{Cmd: "npm run dev"}
			case strings.Contains(content, "\"vite"):
				services["frontend"] = config.Service{Cmd: "npm run dev"}
			case strings.Contains(content, "\"react-scripts"):
				services["frontend"] = config.Service{Cmd: "npm start"}
			case strings.Contains(content, "\"start\""):
				services["frontend"] = config.Service{Cmd: "npm start"}
			case strings.Contains(content, "\"dev\""):
				services["frontend"] = config.Service{Cmd: "npm run dev"}
			}
		}
	}

	// Go
	if fileExists(filepath.Join(dir, "go.mod")) && !dirExists(filepath.Join(dir, "app")) {
		services["server"] = config.Service{Cmd: "go run ."}
	}

	// Python
	if fileExists(filepath.Join(dir, "manage.py")) {
		services["django"] = config.Service{Cmd: "python manage.py runserver"}
	} else if fileExists(filepath.Join(dir, "app.py")) {
		services["flask"] = config.Service{Cmd: "flask run"}
	}

	// Docker compose
	if fileExists(filepath.Join(dir, "docker-compose.yml")) || fileExists(filepath.Join(dir, "compose.yml")) {
		services["docker"] = config.Service{Cmd: "docker compose up"}
	}

	return services
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func init() {
	rootCmd.AddCommand(initCmd)
}
