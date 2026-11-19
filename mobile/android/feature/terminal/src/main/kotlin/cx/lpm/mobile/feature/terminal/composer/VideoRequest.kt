package cx.lpm.mobile.feature.terminal.composer

/**
 * Asking an agent to answer with a narrated video instead of text. Kept in step with
 * the desktop's `videoRequest.ts` and iOS's `VideoRequest.swift`, so a prompt reads
 * the same whichever screen sent it.
 */
object VideoRequest {
    const val SKILL = "explaincast"

    private val alreadyACall = Regex("""^\s*[/$]""" + SKILL + """(\s|$)""")

    /**
     * The prompt as the agent receives it. Claude Code runs a skill as `/name`; every
     * other agent takes the `$name` skill mention. A prompt that already calls the
     * skill goes through untouched, so it is never wrapped twice.
     */
    fun build(cli: String, prompt: String): String {
        if (alreadyACall.containsMatchIn(prompt)) return prompt
        val call = (if (cli == "claude") "/" else "$") + SKILL
        return "$call ${prompt.trim()}"
    }
}
