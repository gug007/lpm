package cx.lpm.mobile.core.demo

/** One lpm command in a demo list. */
internal data class DemoCommand(
    val name: String,
    var folder: String?,
    val description: String,
    val body: String
)

/** A demo list of lpm commands: its folders (kept when emptied) and its commands. */
internal class DemoCommandList(
    val folders: MutableList<String>,
    val commands: MutableList<DemoCommand>
) {
    /** A list holding [commands], its folders taken from them in order. */
    constructor(commands: List<DemoCommand>) : this(
        commands.mapNotNull { it.folder }.distinct().toMutableList(),
        commands.toMutableList()
    )

    /** A copy to change, as a Swift struct is: written back only when the change succeeds. */
    fun copy(): DemoCommandList =
        DemoCommandList(folders.toMutableList(), commands.map { it.copy() }.toMutableList())
}

// The desktop's sample (lpm-commands.ts): a few everyday prompts for every project,
// and a couple each project keeps in its own folder.

internal fun globalCommandsSeed() = DemoCommandList(
    listOf(
        DemoCommand(
            "commit-parts",
            "Git",
            "Small conventional commits, no push",
            "Split my changes into small conventional commits, one concern per commit. Do not push."
        ),
        DemoCommand(
            "write-tests",
            "Testing",
            "Tests for what I just changed",
            "Write focused tests for the code I just changed, run them, and fix anything " +
                "that fails."
        ),
        DemoCommand(
            "explain",
            null,
            "Explain a piece of code",
            "Explain what \$ARGUMENTS does, where it is called from, and what would break if it " +
                "changed."
        )
    )
)

internal fun projectCommandsSeed() = DemoCommandList(
    listOf(
        DemoCommand(
            "review-changes",
            "Review",
            "Bugs and gaps in my uncommitted changes",
            "Review my uncommitted changes for bugs, missing edge cases and untested paths. " +
                "List blocking issues first."
        ),
        DemoCommand(
            "fix-ticket",
            "Bugs",
            "Fix a ticket on the current branch",
            "Fix {{ticket}} on branch {{branch}}. Read the issue first and tell me your plan " +
                "before editing. Keep the diff small and add a test."
        )
    )
)
