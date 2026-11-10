package cx.lpm.mobile.core.model

/**
 * A running agent's live output as the Mac renders it: what the agent says, and one
 * `→ Tool` line for each tool it calls (iOS `AutomationLive.swift`).
 */
sealed interface AutomationLivePart {
    data class Said(val text: String) : AutomationLivePart

    data class Steps(val names: List<String>) : AutomationLivePart
}

fun automationLiveParts(text: String): List<AutomationLivePart> {
    val parts = mutableListOf<AutomationLivePart>()
    val said = mutableListOf<String>()
    val steps = mutableListOf<String>()
    fun close() {
        if (said.isNotEmpty()) parts += AutomationLivePart.Said(said.joinToString("\n").trimEnd())
        if (steps.isNotEmpty()) parts += AutomationLivePart.Steps(steps.toList())
        said.clear()
        steps.clear()
    }
    for (line in text.split("\n")) {
        val trimmed = line.trim()
        val name = stepName(trimmed)
        if (name != null) {
            if (said.isNotEmpty()) close()
            steps += name
        } else if (said.isNotEmpty() || trimmed.isNotEmpty()) {
            if (steps.isNotEmpty()) close()
            said += line
        }
    }
    close()
    return parts
}

/** The tool a `→ Tool` line names, as the desktop's jobLive.ts reads it. */
private fun stepName(line: String): String? = line.removePrefix("→ ")
    .takeIf { line.startsWith("→ ") && it.firstOrNull()?.isWhitespace() == false }

/** "Skill, Read, Bash ×7": each tool once, in the order first used, with its count. */
fun automationStepsLabel(names: List<String>): String = names.groupingBy { it }.eachCount().entries
    .joinToString(", ") { (name, n) -> if (n > 1) "$name ×$n" else name }

/**
 * The last lines of a live run, each run of steps folded onto one line, so a burst of
 * tool calls can't push what the agent said out of view.
 */
fun automationLiveTail(text: String, maxLines: Int = LIVE_TAIL_LINES): String =
    automationLiveParts(text)
        .joinToString("\n") {
            when (it) {
                is AutomationLivePart.Said -> it.text
                is AutomationLivePart.Steps -> "→ " + automationStepsLabel(it.names)
            }
        }
        .split("\n")
        .takeLast(maxLines)
        .joinToString("\n")

/**
 * The questions the run still going asked: one from a finished run names its entry,
 * and a keyed one belongs to no run.
 */
val AutomationJob.runningRunAsks: List<AutomationAsk>
    get() = if (running) asks.filter { it.isOpen && it.at == null && it.holdsJob } else emptyList()

/** The questions it waits on outside the run still going, which shows its own. */
val AutomationJob.asksOutsideRun: List<AutomationAsk>
    get() {
        val run = runningRunAsks.mapTo(HashSet()) { it.id }
        return asks.filterNot { it.id in run }
    }

/**
 * A Manual automation only runs when asked to, so on/off says nothing about it: its
 * switch stays only to turn one back on.
 */
val AutomationJob.hasOnOffSwitch: Boolean
    get() = !(scheduleMode == "manual" && enabled)

private const val LIVE_TAIL_LINES = 12
