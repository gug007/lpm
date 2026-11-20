package cx.lpm.mobile.feature.terminal.composer

/**
 * Asking an agent for an image, which it makes with `lpm generate` and the keys saved in
 * lpm. Kept word for word in step with the desktop's `imageRequest.ts` and iOS's
 * `ImageRequest.swift`, so a prompt reads the same whichever screen sent it.
 */
object ImageRequest {
    private const val ASK = "Make an image with `lpm generate image`"

    /**
     * The prompt as the agent receives it. A prompt that already asks goes through
     * untouched, so a re-sent one isn't wrapped twice.
     */
    fun build(prompt: String): String {
        if (prompt.trimStart().startsWith(ASK)) return prompt
        return "$ASK: ${prompt.trim()}"
    }
}
