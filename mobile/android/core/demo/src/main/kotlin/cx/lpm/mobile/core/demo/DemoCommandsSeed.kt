package cx.lpm.mobile.core.demo

/**
 * One lpm command in a demo list. It ran [runs] times, last at [lastRunAt] once it runs
 * here, else [ranAgo] ms before the moment the list is read.
 */
internal data class DemoCommand(
    val name: String,
    var folder: String?,
    val description: String,
    val body: String,
    val keptOutOfGit: Boolean = false,
    val tracked: Boolean = true,
    var runs: Int = 0,
    var lastRunAt: Long? = null,
    var ranAgo: Long? = null
)

/** One skill not made in lpm in a demo list. */
internal data class DemoOther(
    val name: String,
    val description: String,
    val preview: String,
    val agents: List<String>,
    val path: String,
    var folder: String? = null,
    var atRoot: Boolean = false
)

/** A demo list of lpm commands: its folders (kept when emptied), commands and other skills. */
internal class DemoCommandList(
    val folders: MutableList<String>,
    val commands: MutableList<DemoCommand>,
    val others: MutableList<DemoOther>
) {
    /** A list holding [commands], its folders taken from them in order. */
    constructor(commands: List<DemoCommand>, others: MutableList<DemoOther>) : this(
        commands.mapNotNull { it.folder }.distinct().toMutableList(),
        commands.toMutableList(),
        others
    )

    /** A copy to change, as a Swift struct is: written back only when the change succeeds. */
    fun copy(): DemoCommandList = DemoCommandList(
        folders.toMutableList(),
        commands.map { it.copy() }.toMutableList(),
        others.map { it.copy() }.toMutableList()
    )
}

/** The desktop's sample of skills not made in lpm, by list. `{root}` is the project. */
internal fun globalOthersSeed() = mutableListOf(
    DemoOther(
        "find-docs",
        "Look up current docs for a library",
        "Find the official docs for the library in question and quote the relevant section.",
        listOf("claude", "codex", "gemini", "opencode"),
        "/Users/demo/.agents/skills/find-docs/SKILL.md"
    ),
    DemoOther(
        "playwright-cli",
        "Drive a browser to test a page",
        "Open the page in a browser, follow the steps and report what you see.",
        listOf("claude", "opencode"),
        "/Users/demo/.claude/skills/playwright-cli/SKILL.md"
    ),
    DemoOther(
        "testflight-upload",
        "Upload a build to TestFlight",
        "Archive the app, upload it to TestFlight and report the build number.",
        listOf("codex"),
        "/Users/demo/.codex/skills/testflight-upload/SKILL.md"
    )
)

internal fun projectOthersSeed() = mutableListOf(
    DemoOther(
        "db-migrate",
        "Write and run a database migration",
        "Write a migration for the change, run it locally and show the schema diff.",
        listOf("codex", "gemini", "opencode"),
        "{root}/.agents/skills/db-migrate/SKILL.md"
    ),
    DemoOther(
        "deploy-preview",
        "Deploy the current branch to a preview URL",
        "Build the app, deploy it to a preview URL and post the link.",
        listOf("claude", "opencode"),
        "{root}/.claude/skills/deploy-preview/SKILL.md"
    )
)

private const val MINUTE_MS = 60_000L
private const val HOUR_MS = 60 * MINUTE_MS
private const val DAY_MS = 24 * HOUR_MS

// The desktop's sample (lpm-commands.ts): a few everyday prompts for every project,
// and a couple each project keeps in its own folder.

internal fun globalCommandsSeed() = DemoCommandList(
    listOf(
        DemoCommand(
            "commit-parts",
            "Git",
            "Small conventional commits, no push",
            "Split my changes into small conventional commits, one concern per commit. Do not push.",
            runs = 23,
            ranAgo = 2 * HOUR_MS
        ),
        DemoCommand(
            "write-tests",
            "Testing",
            "Tests for what I just changed",
            "Write focused tests for the code I just changed, run them, and fix anything " +
                "that fails.",
            runs = 2,
            ranAgo = 9 * DAY_MS
        ),
        DemoCommand(
            "explain",
            null,
            "Explain a piece of code",
            "Explain what \$ARGUMENTS does, where it is called from, and what would break if it " +
                "changed."
        )
    ),
    globalOthersSeed()
)

internal fun projectCommandsSeed() = DemoCommandList(
    listOf(
        DemoCommand(
            "review-changes",
            "Review",
            "Bugs and gaps in my uncommitted changes",
            "Review my uncommitted changes for bugs, missing edge cases and untested paths. " +
                "List blocking issues first.",
            runs = 11,
            ranAgo = 40 * MINUTE_MS
        ),
        DemoCommand(
            "fix-ticket",
            "Bugs",
            "Fix a ticket on the current branch",
            "Fix {{ticket}} on branch {{branch}}. Read the issue first and tell me your plan " +
                "before editing. Keep the diff small and add a test.",
            runs = 4,
            ranAgo = 3 * DAY_MS
        )
    ),
    projectOthersSeed()
)
