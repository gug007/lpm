package cx.lpm.mobile.core.demo

// The terminal engine's fixtures: the seeded screens, prompts, slash commands, and each
// demo project's file tree (for `ls` and @-mentions), and the computer `storefront` reaches.

internal const val RESET = "\u001B[0m"
internal const val BOLD = "\u001B[1m"
internal const val DIM = "\u001B[2m"
internal const val RED = "\u001B[31m"
internal const val GREEN = "\u001B[32m"
internal const val YELLOW = "\u001B[33m"
internal const val BLUE_BOLD = "\u001B[1;34m"
internal const val CYAN = "\u001B[36m"
internal const val ORANGE = "\u001B[38;5;208m"
internal const val TEXT_DOT = "\u001B[38;5;153m⏺\u001B[0m"
internal const val TOOL_DOT = "\u001B[32m⏺\u001B[0m"
internal const val PASTE_START = "\u001B[200~"
internal const val PASTE_END = "\u001B[201~"

internal fun DemoServer.seedTerminalFixtures() {
    val prompt = shellPrompt("storefront")
    world.terminals["storefront"] = mutableListOf(
        DemoWorld.Terminal(
            id = "demo-storefront-1",
            label = "Terminal 1",
            project = "storefront",
            buffer = prompt + "ls\r\n" + lsOutput("storefront") + prompt
        ),
        DemoWorld.Terminal(
            id = "demo-storefront-claude",
            label = "Claude",
            project = "storefront",
            emoji = "✻",
            cli = "claude",
            buffer = claudeWelcome("storefront")
        )
    )
    world.composerDraftRev = 1
    world.composerDrafts["demo-storefront-claude"] = DemoWorld.ComposerDraft(
        text = "Add Apple Pay as a payment option in the new checkout flow",
        rev = 1
    )
}

internal val demoOwner: Dict =
    mapOf("kind" to "mobile", "id" to DemoServer.DEVICE_ID, "label" to "This device")

internal fun shellPrompt(project: String): String = "\u001B[1;36m~/dev/$project$RESET $DIM\$$RESET "

internal fun claudeWelcome(project: String): String =
    "$ORANGE✻$RESET ${BOLD}Welcome to Claude Code$RESET\r\n\r\n" +
        "$DIM  /help for help, /status for your current setup\r\n\r\n" +
        "  cwd: /Users/demo/dev/$project$RESET\r\n\r\n"

internal val claudeSlashCommands: List<Dict> = listOf(
    slashCommand("clear", "Clear conversation history and free up context"),
    slashCommand(
        "compact",
        "Clear history but keep a summary in context",
        argumentHint = "<summary instructions>"
    ),
    slashCommand("cost", "Show the total cost of the current session"),
    slashCommand("init", "Initialize a CLAUDE.md file with codebase documentation"),
    slashCommand("memory", "Edit Claude memory files"),
    slashCommand("model", "Set the AI model for Claude Code"),
    slashCommand("review", "Review a pull request"),
    slashCommand("status", "Show version, model, and connectivity"),
    slashCommand(
        "fix-issue",
        "Fix a numbered GitHub issue",
        argumentHint = "<issue-number>",
        source = "project"
    ),
    slashCommand(
        "draft-pr",
        "Draft a pull request description for this branch",
        source = "project"
    )
)

private fun slashCommand(
    name: String,
    description: String,
    argumentHint: String = "",
    source: String = "builtin"
): Dict = mapOf(
    "name" to name,
    "description" to description,
    "argumentHint" to argumentHint,
    "source" to source
)

private fun DemoServer.treeKey(project: String): String {
    val parent = world.project(project)?.parentName
    if (!parent.isNullOrEmpty()) return treeKey(parent)
    val known = listOf("storefront", "api-gateway", "mobile-app", "blog", "design-system")
    return if (project in known) project else "default"
}

/** The project's files as (path, isDirectory). */
private fun DemoServer.mentionTree(project: String): List<Pair<String, Boolean>> =
    when (treeKey(project)) {
        "storefront" -> listOf(
            "app" to true, "app/checkout" to true, "app/layout.tsx" to false,
            "app/page.tsx" to false, "app/checkout/page.tsx" to false,
            "components" to true, "components/CheckoutForm.tsx" to false,
            "components/CartBadge.tsx" to false, "components/Header.tsx" to false,
            "components/ProductCard.tsx" to false,
            "lib" to true, "lib/cart.ts" to false, "lib/payments.ts" to false,
            "lib/products.ts" to false,
            "public" to true, "next.config.mjs" to false, "package.json" to false,
            "README.md" to false, "tsconfig.json" to false
        )

        "api-gateway" -> listOf(
            "cmd" to true, "cmd/server" to true, "cmd/server/main.go" to false,
            "internal" to true, "internal/routes.go" to false,
            "internal/middleware" to true, "internal/middleware/auth.go" to false,
            "go.mod" to false, "go.sum" to false, "Makefile" to false, "README.md" to false
        )

        "mobile-app" -> listOf(
            "src" to true, "src/screens" to true, "src/screens/HomeScreen.tsx" to false,
            "src/screens/SettingsScreen.tsx" to false,
            "src/components" to true, "src/components/Button.tsx" to false,
            "App.tsx" to false, "app.json" to false, "package.json" to false,
            "README.md" to false
        )

        "blog" -> listOf(
            "src" to true, "src/pages" to true, "src/pages/index.astro" to false,
            "src/content" to true, "src/content/posts" to true,
            "src/content/posts/first-post.md" to false,
            "astro.config.mjs" to false, "package.json" to false, "README.md" to false
        )

        "design-system" -> listOf(
            "src" to true, "src/components" to true, "src/components/Button.tsx" to false,
            "src/components/Button.stories.tsx" to false, "src/tokens.ts" to false,
            ".storybook" to true, ".storybook/main.ts" to false,
            "package.json" to false, "README.md" to false
        )

        else -> listOf("src" to true, "package.json" to false, "README.md" to false)
    }

internal fun DemoServer.mentionEntries(project: String): List<Dict> {
    val tree = mentionTree(project)
    val treePaths = tree.map { it.first }.toSet()
    val changed = (world.git[project]?.files?.map { it.path } ?: emptyList()).toSet()
    val entries = tree.map { (path, dir) ->
        mapOf("path" to path, "dir" to dir, "changed" to (path in changed))
    }.toMutableList()
    for (path in (changed - treePaths).sorted()) {
        entries.add(mapOf("path" to path, "dir" to false, "changed" to true))
    }
    return entries
}

/** The paired computer the demo's main project offers in the @ menu; null for the others. */
internal fun mentionComputers(project: String): List<Dict>? {
    if (project != "storefront") return null
    fun place(label: String, path: String): Dict = mapOf(
        "label" to label,
        "path" to path,
        "insert" to "$path (on another computer; reach it with lpm exec --on and lpm cp)"
    )
    return listOf(
        mapOf(
            "name" to "Mac mini",
            "access" to "commands · copy from it",
            "places" to
                listOf(place(project, "Mac mini:~/$project"), place("Home folder", "Mac mini:~"))
        )
    )
}

internal fun DemoServer.lsOutput(project: String): String {
    val top = mentionTree(project).filter { (path, _) -> "/" !in path && !path.startsWith(".") }
    val dirs = top.filter { it.second }.map { BLUE_BOLD + it.first + RESET }
    val files = top.filter { !it.second }.map { it.first }
    return (dirs + files).joinToString("  ") + "\r\n"
}

internal val devLogLines = listOf(
    " ${GREEN}GET$RESET / ${GREEN}200$RESET ${DIM}in 132ms$RESET",
    " ${GREEN}GET$RESET /checkout ${GREEN}200$RESET ${DIM}in 87ms$RESET",
    " ${GREEN}GET$RESET /api/products ${GREEN}200$RESET ${DIM}in 45ms$RESET",
    " ${YELLOW}POST$RESET /api/checkout/session ${GREEN}201$RESET ${DIM}in 214ms$RESET",
    " ${GREEN}GET$RESET /products/aurora-lamp ${GREEN}200$RESET ${DIM}in 96ms$RESET",
    " ○ Compiling /checkout ...",
    " ✓ Compiled /checkout ${DIM}in 412ms$RESET"
)
