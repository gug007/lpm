package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.string
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

// Each domain's decoders, keyed by the frame's `t`; decodeInbound looks one up.

internal typealias Parser = (JsonObject) -> Inbound?

internal fun parsers(build: MutableMap<String, Parser>.() -> Unit): Map<String, Parser> =
    buildMap(build)

internal val JsonObject.ok: Boolean get() = bool("ok") ?: false

/** A reply's failure to surface: null when `ok`, else its `error` or `fallback`. */
internal fun JsonObject.failure(fallback: String): String? =
    if (ok) null else string("error") ?: fallback

/** `o[key] as? String ?? ""` */
internal fun JsonObject.str(key: String): String = string(key).orEmpty()

internal val emptyObject = JsonObject(emptyMap())

internal val inboundParsers: Map<String, Parser> by lazy {
    sessionParsers + projectParsers + configParsers + terminalParsers + composerParsers +
        automationParsers + gitParsers + memoryNotesParsers + serviceParsers + commandParsers
}

internal fun decodeInbound(text: String): Inbound? {
    val obj = try {
        Json.parseToJsonElement(text) as? JsonObject
    } catch (e: SerializationException) {
        null
    } ?: return null
    val t = obj.string("t") ?: return null
    return inboundParsers[t]?.invoke(obj)
}
