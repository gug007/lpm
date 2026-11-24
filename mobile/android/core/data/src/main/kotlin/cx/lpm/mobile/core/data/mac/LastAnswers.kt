package cx.lpm.mobile.core.data.mac

import cx.lpm.mobile.core.data.share.readJson
import cx.lpm.mobile.core.data.share.writeAtomically
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.long
import cx.lpm.mobile.core.model.string
import java.io.File
import java.io.IOException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * The answer an agent tab last ended a turn on, and when in millis; [partial] for a
 * push's, which is cut to what a push holds.
 */
data class LastAnswer(val text: String, val at: Long, val partial: Boolean = false) {
    /** Whether the answer of a turn that ended at [ended] is still worth asking for. */
    fun lacks(ended: Long): Boolean = ended > at || (partial && ended == at)
}

/**
 * The answer each agent tab last ended a turn on, for reading it while the Mac is away
 * (iOS `AgentAnswerStore`): a file in the cache dir, which backups leave out, written
 * while a Mac is live and by a finish's push.
 */
class LastAnswers(private val file: File) {
    @Volatile
    private var all: Map<String, Map<String, LastAnswer>>? = null

    /** One Mac's answers by terminal id. The first call reads the file. */
    fun load(mac: String): Map<String, LastAnswer> = entries()[mac].orEmpty()

    /** Keeps the answers, by terminal id, newer than what's known. */
    @Synchronized
    fun record(mac: String, answers: Map<String, LastAnswer>) {
        val known = load(mac)
        val news = answers
            .mapValues { (_, answer) -> answer.copy(text = answer.text.trim().take(MAX_CHARS)) }
            .filter { (id, answer) ->
                id.isNotEmpty() && answer.text.isNotEmpty() && answer.replaces(known[id])
            }
        if (mac.isEmpty() || news.isEmpty()) return
        val tabs = (known + news).entries.sortedByDescending { it.value.at }.take(MAX_TABS)
            .associate { it.key to it.value }
        write(entries() + (mac to tabs))
    }

    /** A finish's push: the answer it ended on. */
    fun apply(push: JsonObject) {
        if ((push.string("target") ?: "terminal") != "terminal") return
        val terminal = push.string("terminalId").orEmpty()
        val at = push.long("ts") ?: return
        val answer = LastAnswer(push.string("answer").orEmpty(), at, partial = true)
        record(push.string("serverId").orEmpty(), mapOf(terminal to answer))
    }

    /** Forget the Macs the phone no longer has. */
    @Synchronized
    fun keep(macs: Set<String>) {
        val gone = entries().keys - macs
        if (gone.isNotEmpty()) write(entries() - gone)
    }

    private fun LastAnswer.replaces(known: LastAnswer?): Boolean = when {
        known == null -> true
        partial -> at > known.at
        else -> known.lacks(at)
    }

    private fun entries(): Map<String, Map<String, LastAnswer>> =
        all ?: synchronized(this) { all ?: read().also { all = it } }

    private fun read(): Map<String, Map<String, LastAnswer>> =
        file.readJson(JsonObject.serializer()).orEmpty().mapValues { (_, tabs) ->
            (tabs as? JsonObject).orEmpty().mapNotNull { (id, entry) ->
                val o = entry as? JsonObject ?: return@mapNotNull null
                id to LastAnswer(
                    text = o.string("text") ?: return@mapNotNull null,
                    at = o.long("at") ?: return@mapNotNull null,
                    partial = o.bool("partial") ?: false
                )
            }.toMap()
        }

    private fun encode(all: Map<String, Map<String, LastAnswer>>) = buildJsonObject {
        for ((mac, tabs) in all) {
            putJsonObject(mac) {
                for ((id, answer) in tabs) {
                    putJsonObject(id) {
                        put("text", answer.text)
                        put("at", answer.at)
                        if (answer.partial) put("partial", true)
                    }
                }
            }
        }
    }

    private fun write(next: Map<String, Map<String, LastAnswer>>) {
        all = next
        try {
            file.parentFile?.mkdirs()
            file.writeAtomically(encode(next).toString().toByteArray())
        } catch (e: IOException) {
            file.delete()
        }
    }

    private companion object {
        const val MAX_TABS = 60
        const val MAX_CHARS = 32_000
    }
}
