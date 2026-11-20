package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * An agent's `lpm generate` waiting for a yes on the Mac: what it will make, from
 * which prompt, for how much and where it goes (iOS `GenerateRequest`). Only from a
 * Mac whose `features` has "generateApproval".
 */
data class GenerateRequest(
    val id: String,
    val kind: String,
    val agent: String,
    val project: String,
    val prompt: String,
    val model: String,
    val provider: String,
    val details: List<String>,
    val cost: String,
    val out: String,
    val needsKey: String?,
    val keyLabel: String,
    val projectGrant: Boolean,
    val overLimit: Boolean,
    val today: String
) {
    val isSpeech: Boolean get() = kind == "speech"
    val who: String get() = agent.ifEmpty { "An agent" }

    /** The project's yes is offered only once the key is there. */
    val allowsProject: Boolean get() = projectGrant && needsKey == null

    val title: String
        get() {
            if (needsKey ==
                null
            ) {
                return "$who wants to make ${if (isSpeech) "audio" else "an image"}"
            }
            val article = if (keyLabel.firstOrNull()?.lowercaseChar() in VOWELS) "an" else "a"
            return "Add $article $keyLabel key to make this ${if (isSpeech) "audio" else "image"}"
        }

    /** "Nano Banana 2.1 · Google · 16:9 · about 3¢". */
    val facts: String
        get() = (listOf("$model · $provider") + details + cost)
            .filter { it.isNotEmpty() }
            .joinToString(" · ")

    val primaryLabel: String
        get() = when {
            needsKey != null -> "Save and continue"
            allowsProject -> "Allow in $project"
            else -> "Allow"
        }

    /** The decision the primary button sends. */
    val primaryDecision: String get() = if (allowsProject) "project" else "once"

    companion object {
        private val VOWELS = setOf('a', 'e', 'i', 'o', 'u')

        val GET_KEY_URLS = mapOf(
            "gemini" to "https://aistudio.google.com/apikey",
            "openai" to "https://platform.openai.com/api-keys"
        )

        fun parse(o: JsonObject): GenerateRequest? {
            val id = o.string("id")?.takeIf { it.isNotEmpty() } ?: return null
            return GenerateRequest(
                id = id,
                kind = o.string("kind") ?: "image",
                agent = o.string("agent").orEmpty(),
                project = o.string("project").orEmpty(),
                prompt = o.string("prompt").orEmpty(),
                model = o.string("model").orEmpty(),
                provider = o.string("provider").orEmpty(),
                details = o.strings("details").orEmpty(),
                cost = o.string("cost").orEmpty(),
                out = o.string("out").orEmpty(),
                needsKey = o.string("needsKey")?.takeIf { it.isNotEmpty() },
                keyLabel = o.string("keyLabel").orEmpty(),
                projectGrant = o.bool("projectGrant") ?: false,
                overLimit = o.bool("overLimit") ?: false,
                today = o.string("today").orEmpty()
            )
        }
    }
}
