package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/** One step of a take the Mac is transcribing. */
data class DictationEvent(
    val id: String,
    val kind: String,
    val text: String,
    val code: String,
    val message: String
) {
    companion object {
        fun parse(o: JsonObject): DictationEvent = DictationEvent(
            id = o.string("id").orEmpty(),
            kind = o.string("event").orEmpty(),
            text = o.string("text").orEmpty(),
            code = o.string("code").orEmpty(),
            message = o.string("message").orEmpty()
        )
    }
}
