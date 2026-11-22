package cx.lpm.mobile.core.demo

/*
 * Demo handlers for agent tabs (iOS `DemoAgents`): the agents a new tab can start,
 * each project's past conversations, and resuming one. An agent tab opens already past
 * its startup, so it takes input the way the Claude tab does.
 */

private const val TEAL = "\u001B[38;5;36m"
private const val BLUE = "\u001B[38;5;75m"

internal fun DemoServer.registerAgentHandlers() {
    register("agentOptions") { push(mapOf("t" to "agentOptions", "agents" to demoAgentOptions)) }
    register("agentSessions") { o ->
        val project = o.string("project") ?: return@register
        if (world.project(project)?.isRemote == true) {
            push(
                mapOf(
                    "t" to "agentSessions",
                    "project" to project,
                    "ok" to false,
                    "error" to "Sessions of an SSH project live on its host."
                )
            )
            return@register
        }
        val search = o.string("search").orEmpty().trim()
        val limit = (o.int("limit") ?: 40).coerceIn(1, 500)
        val matching = demoSessions(project).filter {
            search.isEmpty() || it.title.contains(search, ignoreCase = true) ||
                it.preview.contains(search, ignoreCase = true)
        }
        pushAfter(
            0.4,
            mapOf(
                "t" to "agentSessions",
                "project" to project,
                "ok" to true,
                "search" to o.string("search").orEmpty(),
                "limit" to limit,
                "hasMore" to (matching.size > limit),
                "sessions" to matching.take(limit).map { sessionRow(it, project) }
            )
        )
    }
    register("resumeSession") { o ->
        val project = o.string("project") ?: return@register
        val provider = o.string("provider") ?: return@register
        val sessionId = o.string("sessionId") ?: return@register
        val title = o.string("title")?.takeIf { it.isNotEmpty() } ?: "Untitled session"
        val id = nextTerminalId(project).second
        val buffer = agentBanner(provider, project, model = "", effort = "") +
            "$DIM  Resumed “$title”$RESET\r\n\r\n" +
            "$TEXT_DOT Picking up where we left off on $BOLD$title$RESET. What's next?\r\n\r\n" +
            "$BOLD>$RESET "
        world.terminals.getOrPut(project) {
            mutableListOf()
        }.add(agentTab(id, title, project, provider, buffer))
        world.sessionTabs["$provider:$sessionId"] = id
        push(mapOf("t" to "resumeSession", "ok" to true))
    }
}

/** The tab a `newTerminal` with an agent opens, null for a plain shell. */
internal fun DemoServer.demoAgentTerminal(
    o: Dict,
    id: String,
    project: String
): DemoWorld.Terminal? {
    val agent = o.string("agent")?.takeIf { it.isNotEmpty() } ?: return null
    val option = demoAgentOptions.firstOrNull { it["id"] == agent } ?: return null
    return demoAgentTab(
        agent,
        label = option["label"] as? String ?: agent,
        id = id,
        project = project,
        model = o.string("model").orEmpty(),
        effort = o.string("effort").orEmpty(),
        prompt = o.string("prompt").orEmpty()
    )
}

/**
 * The tab a `runAction` with a `prompt` opens for an action that starts an agent, null
 * for any other.
 */
internal fun DemoServer.demoActionAgentTerminal(
    action: Dict,
    prompt: String,
    label: String,
    id: String,
    project: String
): DemoWorld.Terminal? {
    if (prompt.isEmpty() || action.string("type") != "terminal") return null
    val ids = demoAgentOptions.mapNotNull { it["id"] as? String }
    val agent = agentCommand(action.string("cmd").orEmpty(), ids) ?: return null
    return demoAgentTab(agent, label, id, project, model = "", effort = "", prompt = prompt)
}

private val COMMAND_WORD = Regex("""[^\s;&|]+""")
private val PROGRAM_EXTENSION = Regex("""\.(exe|cmd|bat)$""", RegexOption.IGNORE_CASE)

/** The agent [cmd] starts: its first command word naming one of [agents] by file name. */
private fun agentCommand(cmd: String, agents: List<String>): String? = COMMAND_WORD.findAll(cmd)
    .map { word ->
        val name = word.value.split('/', '\\').lastOrNull { it.isNotEmpty() } ?: word.value
        name.replace(PROGRAM_EXTENSION, "")
    }
    .firstOrNull { it in agents }

private fun demoAgentTab(
    agent: String,
    label: String,
    id: String,
    project: String,
    model: String,
    effort: String,
    prompt: String
): DemoWorld.Terminal {
    val task = prompt.trim()
    var buffer = agentBanner(agent, project, model, effort)
    if (task.isNotEmpty()) {
        buffer += "$BOLD>$RESET ${task.replace("\n", "\r\n  ")}\r\n\r\n" +
            "$TEXT_DOT On it — I'll read the relevant files first, then make the change.\r\n\r\n"
    }
    buffer += "$BOLD>$RESET "
    return agentTab(id, label, project, agent, buffer)
}

private fun agentTab(id: String, label: String, project: String, cli: String, buffer: String) =
    DemoWorld.Terminal(
        id = id,
        label = label,
        project = project,
        cli = cli,
        buffer = buffer,
        scriptStarted = true,
        scriptFinished = true
    )

private fun agentBanner(agent: String, project: String, model: String, effort: String): String {
    val picked = listOfNotNull(
        optionLabel(agent, model),
        effortLabel(agent, model, effort)
    ).joinToString(" · ")
    val setup = if (picked.isEmpty()) "" else "  model: $picked\r\n"
    return when (agent) {
        "claude" ->
            "$ORANGE✻$RESET ${BOLD}Welcome to Claude Code$RESET\r\n\r\n" +
                "$DIM  /help for help, /status for your current setup\r\n\r\n" +
                "  cwd: /Users/demo/dev/$project\r\n$setup$RESET\r\n"

        "codex" ->
            "$TEAL>_$RESET ${BOLD}OpenAI Codex$RESET $DIM(v0.58.0)$RESET\r\n\r\n" +
                "$DIM  directory: ~/dev/$project\r\n$setup$RESET\r\n"

        "gemini" ->
            "$BLUE✦$RESET ${BOLD}Gemini CLI$RESET\r\n\r\n" +
                "$DIM  Tips: ask questions, edit files, or run commands.\r\n" +
                "  cwd: ~/dev/$project$RESET\r\n\r\n"

        "cursor" -> "${BOLD}Cursor Agent$RESET\r\n\r\n$DIM  ~/dev/$project$RESET\r\n\r\n"

        else -> "${BOLD}opencode$RESET ${DIM}v0.15.2\r\n\r\n  cwd: ~/dev/$project$RESET\r\n\r\n"
    }
}

private class DemoSession(
    val provider: String,
    val sessionId: String,
    val title: String,
    val preview: String,
    /** Seconds before now it last ran. */
    val ago: Long,
    val branch: String?,
    val account: String? = null
)

private fun DemoServer.sessionRow(s: DemoSession, project: String): Dict {
    val key = "${s.provider}:${s.sessionId}"
    val row = mutableMapOf<String, Any?>(
        "key" to key,
        "provider" to s.provider,
        "sessionId" to s.sessionId,
        "title" to s.title,
        "preview" to s.preview,
        "updatedAt" to nowMillis() - s.ago * 1000
    )
    s.branch?.let { row["gitBranch"] = it }
    s.account?.let { row["account"] = it }
    val tab = world.sessionTabs[key]
    if (tab != null && world.terminals[project]?.any { it.id == tab } == true) row["openIn"] = tab
    return row
}

private const val HOUR = 3_600L
private const val DAY = 86_400L

private fun demoSessions(project: String): List<DemoSession> = when (project) {
    "storefront" -> listOf(
        DemoSession(
            "claude",
            "7c1e4f2a-tax",
            "Fix checkout tax rounding",
            "Totals are off by a cent when a coupon and tax both apply",
            2 * HOUR,
            "fix/tax"
        ),
        DemoSession(
            "gemini",
            "3f9a1c7e-ratelimits",
            "Add rate limits to the API",
            "Limit /v1/orders to 60 a minute per customer",
            4 * HOUR,
            "main"
        ),
        DemoSession(
            "claude",
            "b93d0e51-applepay",
            "Add Apple Pay to checkout",
            "Offer Apple Pay in the payment step, behind a feature flag",
            DAY,
            "main",
            account = "Work"
        ),
        DemoSession(
            "opencode",
            "ses_4c2e8a1f9bSearch",
            "Search page skeleton",
            "Add a loading state to the search results page",
            DAY + 5 * HOUR,
            "feat/search"
        ),
        DemoSession(
            "codex",
            "019a6c2e-zustand",
            "Migrate cart store to Zustand",
            "Replace the cart context with a Zustand store and keep the badge in sync",
            3 * DAY,
            "cart-store"
        ),
        DemoSession(
            "claude",
            "e4a7f6c3-node22",
            "Why does CI fail on Node 22?",
            "",
            6 * DAY,
            "main"
        ),
        DemoSession(
            "cursor",
            "8d2b6e40-cards",
            "Tidy the product card styles",
            "Use the spacing tokens on product cards and fix the price wrap",
            8 * DAY,
            "main"
        ),
        DemoSession(
            "codex",
            "019a2b71-coupons",
            "Write e2e tests for coupons",
            "Playwright tests for applying, stacking and removing coupons",
            12 * DAY,
            "main"
        ),
        DemoSession(
            "claude",
            "5f08d9b4-images",
            "Speed up product image loading",
            "Lazy-load product images and serve AVIF where the browser takes it",
            40 * DAY,
            "perf/images"
        )
    )

    "api-gateway" -> listOf(
        DemoSession(
            "codex",
            "019a7d10-ratelimit",
            "Add rate limiting middleware",
            "Token bucket per API key, configurable per route",
            DAY,
            "main"
        ),
        DemoSession("claude", "a2c4e6f8-authdocs", "Document the auth flow", "", 9 * DAY, "main")
    )

    else -> emptyList()
}

private fun efforts(max: Boolean): List<Dict> = buildList {
    add(mapOf("value" to "", "label" to "Default"))
    add(mapOf("value" to "low", "label" to "Low"))
    add(mapOf("value" to "medium", "label" to "Medium"))
    add(mapOf("value" to "high", "label" to "High"))
    add(mapOf("value" to "xhigh", "label" to "Extra High"))
    if (max) add(mapOf("value" to "max", "label" to "Max"))
}

private fun models(list: List<Pair<String, String>>, max: Boolean): List<Dict> =
    list.map { (value, label) ->
        mapOf("value" to value, "label" to label, "efforts" to efforts(max))
    }

internal val demoAgentOptions: List<Dict> = listOf(
    mapOf(
        "id" to "claude",
        "label" to "Claude Code",
        "models" to models(
            listOf(
                "" to "Default",
                "fable" to "Fable",
                "opus" to "Opus",
                "sonnet" to "Sonnet",
                "haiku" to "Haiku"
            ),
            max = true
        )
    ),
    mapOf(
        "id" to "codex",
        "label" to "Codex",
        "models" to models(
            listOf(
                "" to "Default",
                "gpt-6.1-sol" to "GPT-6.1 Sol",
                "gpt-6-astra" to "GPT-6 Astra",
                "gpt-5.5" to "GPT-5.5"
            ),
            max = false
        )
    ),
    mapOf("id" to "gemini", "label" to "Gemini", "models" to emptyList<Dict>()),
    mapOf("id" to "opencode", "label" to "OpenCode", "models" to emptyList<Dict>())
)

@Suppress("UNCHECKED_CAST")
private fun modelOption(agent: String, model: String): Dict? {
    val option = demoAgentOptions.firstOrNull { it["id"] == agent } ?: return null
    return (option["models"] as? List<Dict>)?.firstOrNull { it["value"] == model }
}

private fun optionLabel(agent: String, model: String): String? =
    if (model.isEmpty()) null else modelOption(agent, model)?.get("label") as? String

@Suppress("UNCHECKED_CAST")
private fun effortLabel(agent: String, model: String, effort: String): String? {
    if (effort.isEmpty()) return null
    val levels = modelOption(agent, model)?.get("efforts") as? List<Dict>
    return levels?.firstOrNull { it["value"] == effort }?.get("label") as? String
}
