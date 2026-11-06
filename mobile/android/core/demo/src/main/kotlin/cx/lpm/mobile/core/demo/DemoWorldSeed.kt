package cx.lpm.mobile.core.demo

import cx.lpm.mobile.core.demo.DemoWorld.GitBranch
import cx.lpm.mobile.core.demo.DemoWorld.GitFile
import cx.lpm.mobile.core.demo.DemoWorld.GitRepo
import cx.lpm.mobile.core.demo.DemoWorld.Project
import cx.lpm.mobile.core.demo.DemoWorld.Svc
import java.time.Instant

// The seed: projects, the sidebar, terminals and git state.

internal fun DemoWorld.seedProjects() {
    fun action(name: String, label: String, cmd: String, display: String? = null): Dict {
        val action = mutableMapOf<String, Any?>(
            "name" to name,
            "label" to label,
            "type" to "command",
            "cmd" to cmd
        )
        if (display != null) action["display"] = display
        return action
    }

    fun agent(name: String, label: String, cmd: String, layer: String, color: String): Dict = mapOf(
        "name" to name,
        "label" to label,
        "type" to "terminal",
        "cmd" to cmd,
        "color" to color,
        "display" to "agents",
        "layer" to layer
    )
    projects = mutableListOf(
        Project(
            name = "storefront",
            label = "storefront",
            running = true,
            services = listOf(
                Svc(name = "web", cmd = "npm run dev", port = 3000, running = true),
                Svc(name = "api", cmd = "npm run api", port = 4000, running = true),
                Svc(name = "worker", cmd = "npm run worker", port = 0, running = false)
            ),
            actions = listOf(
                action("test", "Test", "npm test", display = "checks"),
                action("lint", "Lint", "npm run lint", display = "checks"),
                agent(
                    "fix-tests",
                    "Fix tests",
                    "claude \"Fix the failing tests\"",
                    layer = "claude",
                    color = "claude"
                ),
                agent(
                    "review",
                    "Review",
                    "claude \"Review my changes\"",
                    layer = "claude",
                    color = "claude"
                ),
                agent(
                    "codex-review",
                    "Review",
                    "codex \"Review my changes\"",
                    layer = "codex",
                    color = "cyan"
                )
            ),
            zones = listOf(
                mapOf(
                    "name" to "checks",
                    "label" to "Checks",
                    "rows" to 1,
                    "display" to "header",
                    "position" to 1,
                    "source" to "project"
                ),
                mapOf(
                    "name" to "agents",
                    "label" to "Agents",
                    "rows" to 2,
                    "display" to "header",
                    "position" to 2,
                    "source" to "project",
                    "layers" to listOf(
                        mapOf("name" to "claude", "label" to "Claude", "position" to 1),
                        mapOf("name" to "codex", "label" to "Codex", "position" to 2)
                    )
                )
            )
        ),
        Project(
            name = "api-gateway",
            label = "api-gateway",
            running = false,
            services = listOf(
                Svc(name = "server", cmd = "go run ./cmd/server", port = 8080, running = false)
            ),
            actions = listOf(
                mapOf(
                    "name" to "test",
                    "label" to "Test",
                    "type" to "background",
                    "cmd" to "go test ./..."
                ),
                mapOf(
                    "name" to "release",
                    "label" to "🚀 Release · v2.4.1 · 3d ago",
                    "configLabel" to "🚀 Release · {{git.tag}} · {{git.tagAge}}",
                    "type" to "background",
                    "cmd" to "./scripts/release.sh",
                    "confirm" to true
                ),
                mapOf(
                    "name" to "stars",
                    "label" to "Stars",
                    "type" to "background",
                    "cmd" to "gh api repos/example/api-gateway --jq .stargazers_count",
                    "popup" to mapOf(
                        "format" to "html",
                        "title" to "GitHub stars",
                        "width" to 380,
                        "height" to 200
                    ),
                    "configPopup" to mapOf(
                        "html" to "popups/stars.html",
                        "data" to "\$(node scripts/stars.mjs)",
                        "title" to "GitHub stars",
                        "size" to "380x200"
                    )
                )
            )
        ),
        Project(
            name = "mobile-app",
            label = "mobile-app",
            running = false,
            claudeAccounts = listOf("work", CLAUDE_MAIN_LOGIN),
            services = listOf(Svc(name = "metro", cmd = "npm start", port = 8081, running = false)),
            actions = listOf(
                mapOf(
                    "name" to "clean",
                    "label" to "Clear caches",
                    "type" to "background",
                    "cmd" to "npm run clean",
                    "confirm" to true
                )
            )
        ),
        Project(
            name = "blog",
            label = "blog",
            running = false,
            services = listOf(Svc(name = "dev", cmd = "npm run dev", port = 4321, running = false)),
            actions = listOf(
                mapOf(
                    "name" to "new-post",
                    "label" to "New post",
                    "type" to "background",
                    "cmd" to "npm run new-post -- \"{{title}}\"",
                    "inputs" to listOf(
                        mapOf(
                            "key" to "title",
                            "label" to "Title",
                            "required" to true,
                            "placeholder" to "Post title"
                        )
                    )
                )
            )
        ),
        Project(
            name = "design-system",
            label = "design-system",
            running = false,
            autoPull = false,
            claudeAccount = "work",
            services = listOf(
                Svc(name = "storybook", cmd = "npm run storybook", port = 6006, running = false)
            )
        )
    )
}

internal fun DemoWorld.seedSidebar() {
    folders = mutableListOf(
        DemoWorld.Folder(
            id = "client-work",
            name = "Client Work",
            collapsed = false,
            members = listOf("blog", "design-system")
        )
    )
    sidebarOrder = mutableListOf("storefront", "api-gateway", "mobile-app", "group:client-work")
}

internal fun DemoWorld.seedTerminals() {
    terminals["storefront"] = mutableListOf(
        DemoWorld.Terminal(
            id = "demo-storefront-1",
            label = "Terminal 1",
            project = "storefront",
            buffer = "~/dev/storefront $ "
        ),
        DemoWorld.Terminal(
            id = "demo-storefront-claude",
            label = "Claude",
            project = "storefront",
            emoji = "✻",
            cli = "claude",
            buffer = "Welcome to Claude Code\r\n\r\n"
        )
    )
}

internal fun DemoWorld.seedGit(nowS: Long) {
    fun date(daysAgo: Int): String = iso8601(Instant.ofEpochSecond(nowS - daysAgo * 86400L))
    git["storefront"] = GitRepo(
        branch = "feat/checkout-redesign",
        ahead = 2,
        behind = 0,
        files = listOf(
            GitFile(path = "components/CheckoutForm.tsx", status = "modified", stamp = "s1"),
            GitFile(path = "app/checkout/page.tsx", status = "modified", stamp = "s2"),
            GitFile(path = "lib/payments.ts", status = "added", stamp = "s3"),
            GitFile(path = "README.md", status = "modified", stamp = "s4")
        ),
        branches = listOf(
            GitBranch(name = "feat/checkout-redesign", committerDate = date(0)),
            GitBranch(name = "main", committerDate = date(3)),
            GitBranch(name = "fix/cart-badge", committerDate = date(5)),
            GitBranch(name = "main", committerDate = date(3), remote = "origin")
        )
    )
    for (name in listOf("api-gateway", "mobile-app", "blog", "design-system")) {
        git[name] = GitRepo(
            branch = "main",
            branches = listOf(
                GitBranch(name = "main", committerDate = date(7)),
                GitBranch(name = "main", committerDate = date(7), remote = "origin")
            )
        )
    }
    git["api-gateway"]?.autoPulled = mapOf(
        "count" to 3,
        "branch" to "main",
        "from" to "4f1c2ab",
        "to" to "9e7d031",
        "at" to (nowS - 25 * 60) * 1000
    )
}
