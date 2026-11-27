package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * A commit a git hook stopped, as the Mac read it (PROTOCOL.md, `gitCommit`'s
 * `hookFailure`; iOS `CommitHookFailure`): the desktop's `HookFailure`.
 */
data class CommitHookFailure(
    /** The hook's name as git calls it: "pre-commit", "commit-msg". */
    val hook: String,
    /** What it found in a few words, when its output says. */
    val summary: String?,
    /** What it printed, without colours. */
    val output: String,
    /** The picked files the hook rewrote (a formatter) and left unstaged. */
    val changed: List<String>
) {
    /**
     * The lines the folded output shows: the ones that report something, else the
     * last few (the desktop's `outputPreview`).
     */
    val preview: List<String> = output.split("\n")
        .filter { line -> line.any { !it.isSpaceOrTab() } && !isNoise(line) }
        .let { lines ->
            val findings = lines.filter(::reportsSomething)
            if (findings.isEmpty()) lines.takeLast(PREVIEW_LINES) else findings.take(PREVIEW_LINES)
        }

    val lineCount: Int = if (output.isEmpty()) 0 else output.count { it == '\n' } + 1

    /**
     * What an agent asked to fix the hook's findings is told: the commit it stopped,
     * what it printed, and to commit again with the hook running (the desktop's
     * `commitHookPrompt`).
     */
    fun prompt(message: String, files: List<String>): String {
        val subject = message.trimmingWhitespace().split("\n").first()
        val found = summary?.let { " It found: $it." }.orEmpty()
        val printed = output.split("\n").takeLast(PROMPT_LINES).joinToString("\n")
        val lines = mutableListOf(
            "I tried to commit with the message \"$subject\", and the $hook hook stopped " +
                "it.$found What it printed:",
            "",
            "```",
            printed,
            "```",
            "",
            "Fix what it found, then commit the same files again with the same message. " +
                "Let the hook run: don't skip it with --no-verify."
        )
        if (files.isNotEmpty()) {
            lines += listOf("", "Files in the commit:")
            lines += files.take(PROMPT_FILES).map { "- $it" }
            if (files.size > PROMPT_FILES) lines += "- and ${files.size - PROMPT_FILES} more"
        }
        return lines.joinToString("\n")
    }

    companion object {
        private const val PREVIEW_LINES = 6
        private const val PROMPT_FILES = 30
        private const val PROMPT_LINES = 120

        // lint-staged's and listr's progress rows, and a hook manager's own exit line.
        private val NOISE = listOf(
            "[STARTED]",
            "[COMPLETED]",
            "[SKIPPED]",
            "[SUCCESS]",
            "[TITLE]",
            "husky - ",
            "hint: "
        )
        private val FINDINGS = listOf("error", "warning", "failed", "✖", "×")
        private val PLACE = Regex("""\d+:\d+""")

        /** Null without a hook's name: an older Mac, or a commit no hook stopped. */
        fun parse(o: JsonObject?): CommitHookFailure? {
            val hook = o?.string("hook")?.takeIf { it.isNotEmpty() } ?: return null
            return CommitHookFailure(
                hook = hook,
                summary = o.string("summary")?.takeIf { it.isNotEmpty() },
                output = o.string("output").orEmpty(),
                changed = o.strings("changed").orEmpty()
            )
        }

        private fun isNoise(line: String): Boolean {
            val trimmed = line.trimStart(' ', '\t')
            return NOISE.any { trimmed.startsWith(it) }
        }

        private fun reportsSomething(line: String): Boolean {
            val lower = line.lowercase()
            return FINDINGS.any { it in lower } || PLACE.containsMatchIn(line)
        }

        // Swift's `CharacterSet.whitespaces`: tab and the space separators.
        private fun Char.isSpaceOrTab(): Boolean =
            this == '\t' || Character.getType(this).toByte() == Character.SPACE_SEPARATOR
    }
}
