package cx.lpm.mobile.core.model

/**
 * Something a new tab can start with its prompt, as the desktop's empty project offers
 * it: a project action that opens an agent (and the split button or menu it sits in),
 * or a bare agent when the project has none.
 */
data class LaunchpadOption(
    val id: String,
    val label: String,
    val agent: String,
    val action: Action? = null,
    val group: Action? = null
)

/**
 * One entry of the New Tab sheet's Start list: a single option, or a header split
 * button or menu holding several.
 */
data class LaunchpadTab(
    val id: String,
    val label: String,
    val options: List<LaunchpadOption>,
    /** What the entry itself picks; null for a menu, which only opens. */
    val primary: LaunchpadOption?
)

/**
 * The project's actions that open one of [agents], split buttons and menus kept whole
 * with only their agent items, each split led by the item its button runs ([lastUsed]
 * names a `last-used` group's). The bare agents when the project has none.
 * [skipOwnTasks] leaves out the actions that start their agent on a task of their own,
 * for a prompt that is the task. Mirrors the desktop's launchpadTabs.
 */
fun launchpadTabs(
    actions: List<Action>,
    agents: List<AgentOption>,
    skipOwnTasks: Boolean = false,
    lastUsed: (group: String) -> String? = { null }
): List<LaunchpadTab> {
    val ids = agents.map { it.id }
    fun option(action: Action, group: Action? = null): LaunchpadOption? {
        if (action.type != "terminal") return null
        val agent = agentCli(action.cmd, ids) ?: return null
        if (skipOwnTasks && action.startsOwnTask(agent)) return null
        return LaunchpadOption(action.name, action.label, agent, action, group)
    }
    fun descendants(actions: List<Action>): List<Action> =
        actions.flatMap { listOf(it) + descendants(it.children) }

    val tabs = actions.mapNotNull { action ->
        val own = option(action)
        val children = descendants(action.children).mapNotNull { option(it, action) }
        if (children.isEmpty()) {
            return@mapNotNull own?.let {
                LaunchpadTab(it.id, it.label, listOf(it), it)
            }
        }
        val options = listOfNotNull(own) + children
        val lead = action.primaryChild(lastUsed(action.name))
        val primary = options.firstOrNull { it.id == lead?.name }
            ?: options.firstOrNull()?.takeIf { lead != null || action.cmd.isNotEmpty() }
        LaunchpadTab(action.name, action.label, options, primary)
    }
    if (tabs.isNotEmpty()) return tabs
    return agents.map {
        val bare = LaunchpadOption(it.id, it.label, it.id)
        LaunchpadTab(bare.id, bare.label, listOf(bare), bare)
    }
}

private val COMMAND_WORD = Regex("""[^\s;&|]+""")
private val PROGRAM_EXTENSION = Regex("""\.(exe|cmd|bat)$""", RegexOption.IGNORE_CASE)

/**
 * The agent [cmd] starts: the first command word naming one of [agents] by its file
 * name (`/usr/local/bin/claude`, `codex.exe`). Mirrors the desktop's detectAICLI.
 */
fun agentCli(cmd: String, agents: List<String>): String? = COMMAND_WORD.findAll(cmd)
    .map { programName(it.value) }
    .firstOrNull { it in agents }

private fun programName(word: String): String {
    val name = word.split('/', '\\').lastOrNull { it.isNotEmpty() } ?: word
    return name.replace(PROGRAM_EXTENSION, "")
}

private val SHELL_WORD = Regex("""(?:[^\s;&|"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+|[;&|]+""")
private val QUOTED_TASK = Regex("""^(["']).*\s.*\1$""", RegexOption.DOT_MATCHES_ALL)

/**
 * The [agent] this action opens starts on a task of its own: a saved prompt, or a
 * quoted multi-word argument after the agent's command word that isn't a flag's value
 * (`claude "Review my changes"`). Mirrors the desktop's startsOwnTask.
 */
fun Action.startsOwnTask(agent: String): Boolean {
    if (prompt.isNotBlank()) return true
    val word =
        COMMAND_WORD.findAll(cmd).firstOrNull { programName(it.value) == agent } ?: return false
    val words = SHELL_WORD.findAll(cmd.substring(word.range.last + 1)).map { it.value }.toList()
    words.forEachIndexed { i, w ->
        if (w.first() in ";&|") return false
        if (QUOTED_TASK.matches(w) && words.getOrNull(i - 1)?.startsWith("-") != true) return true
    }
    return false
}
