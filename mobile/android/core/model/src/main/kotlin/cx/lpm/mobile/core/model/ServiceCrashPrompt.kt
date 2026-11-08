package cx.lpm.mobile.core.model

/**
 * What an agent asked to fix a crashed service is told (iOS `ServiceCrashPrompt`), in
 * the words of the desktop's serviceErrorPrompt.ts: the service, how it starts and how
 * it ended, then its latest errors with their stacks, or its last lines when none of
 * them reads as an error.
 */
object ServiceCrashPrompt {
    private const val MAX_ERRORS = 3
    private const val TAIL_LINES = 40

    fun text(service: String, cmd: String, exitCode: Int?, log: String): String {
        val started = if (cmd.isEmpty()) "" else ", started with `$cmd`,"
        var intro = "The `$service` service in this project$started ${exitText(exitCode)}."
        val errors = latestErrors(log)
        val quoted = when {
            errors.size == 1 -> {
                val times = if (errors[0].times > 1) " ${errors[0].times} times" else ""
                intro += " It logged this error$times:"
                errors[0].text
            }

            errors.isNotEmpty() -> {
                intro += " It logged these errors, the latest last:"
                errors.joinToString("\n\n") {
                    if (it.times > 1) "${it.text}\n(logged ${it.times} times)" else it.text
                }
            }

            else -> tail(log).also { if (it.isNotEmpty()) intro += " The last lines it printed:" }
        }
        val lines = mutableListOf(intro)
        if (quoted.isNotEmpty()) lines += listOf("", "```", quoted, "```")
        lines += listOf("", "Find the cause in the code and fix it.")
        return lines.joinToString("\n")
    }

    /** "exited with code 1", "exited", or "stopped" when the shell couldn't say. */
    private fun exitText(code: Int?): String = when (code) {
        null -> "stopped"
        0 -> "exited"
        else -> "exited with code $code"
    }

    private data class Logged(val text: String, val times: Int)

    /** The latest distinct errors in [log], oldest first, each with how many times it was logged. */
    private fun latestErrors(log: String): List<Logged> {
        val lines = LogSeverity.lines(log)
        val seen = mutableListOf<Logged>()
        for (block in LogSeverity.errorBlocks(lines)) {
            val text = block.joinToString("\n") { lines[it] }
            val earlier = seen.indexOfFirst { it.text == text }
            val times = (if (earlier >= 0) seen.removeAt(earlier).times else 0) + 1
            seen += Logged(text, times)
        }
        return seen.takeLast(MAX_ERRORS)
    }

    private fun tail(log: String): String = LogSeverity.lines(log).dropLastWhile {
        it.isBlank()
    }.takeLast(TAIL_LINES).joinToString("\n")
}
