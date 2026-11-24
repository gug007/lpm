package cx.lpm.mobile.core.data.mac

import cx.lpm.mobile.core.data.client.CertPinning
import cx.lpm.mobile.core.data.share.readJson
import cx.lpm.mobile.core.data.share.writeAtomically
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.long
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.protocol.Inbound
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Each Mac's agent tabs as this phone last had them (iOS `AgentTabSnapshots`): the tab
 * lists and each tab's last screen, so a project opens on something to read while the
 * Mac is away. In the cache dir, which backups leave out, and gone with the Mac when
 * it's unpaired, as are its [answers].
 */
class AgentTabSnapshots(
    private val dir: File,
    val answers: LastAnswers,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher
) {
    /** The escape codes that draw a screen again, and when it was live in millis. */
    data class Screen(val text: String, val at: Long)

    /** A project's `terminals` frame, and the agent tabs it lists. */
    private class Listed(val frame: String, agentTabs: Lazy<List<TerminalInfo>>) {
        val tabs by agentTabs
    }

    private val lists = mutableMapOf<String, Map<String, Listed>>()
    private val dirty = mutableSetOf<String>()
    private var flush: Job? = null

    // One file operation at a time, in the order asked for: a removal isn't undone by a
    // write that was already on its way.
    private val disk = Mutex()

    /** Keep a project's list, sent as [text], and drop the screens of tabs it no longer has. */
    fun record(frame: Inbound.Terminals, text: String, mac: String) {
        val entry = entries(mac)
        val known = entry[frame.project]
        if (frame.project.isEmpty() || known?.frame == text) return
        val left = frame.terminals.map { it.id }.toSet()
        val gone = known?.tabs.orEmpty().filter { it.id !in left }
        lists[mac] = entry + (frame.project to Listed(text, lazyOf(frame.agentTabs)))
        save(mac)
        delete(gone.map { screenFile(mac, it.id) })
    }

    /** Forget projects the Mac no longer has. */
    fun keep(projects: Set<String>, mac: String) {
        val gone = entries(mac) - projects
        if (gone.isEmpty()) return
        lists[mac] = entries(mac) - gone.keys
        save(mac)
        delete(gone.values.flatMap { it.tabs }.map { screenFile(mac, it.id) })
    }

    /** The project's agent tabs, as the Mac last listed them. */
    fun tabs(project: String, mac: String): List<TerminalInfo> =
        entries(mac)[project]?.tabs.orEmpty()

    /** Those of [tabs] there's something to show of: a screen, or an answer. */
    suspend fun readableTabs(project: String, mac: String, widgetId: String?): List<TerminalInfo> {
        val tabs = tabs(project, mac)
        if (tabs.isEmpty()) return tabs
        return withContext(io) {
            val answered = widgetId?.let(answers::load).orEmpty()
            tabs.filter { it.id in answered || screenFile(mac, it.id).exists() }
        }
    }

    fun saveScreen(text: String, at: Long, terminal: String, mac: String) {
        val file = screenFile(mac, terminal)
        val json = buildJsonObject {
            put("text", text)
            put("at", at)
        }
        onDisk { write(file, json.toString()) }
    }

    suspend fun screen(terminal: String, mac: String): Screen? = withContext(io) {
        val o = read(screenFile(mac, terminal)) ?: return@withContext null
        val text = o.string("text") ?: return@withContext null
        o.long("at")?.let { Screen(text, it) }
    }

    suspend fun loadAnswers(widgetId: String): Map<String, LastAnswer> =
        withContext(io) { answers.load(widgetId) }

    suspend fun recordAnswers(widgetId: String, recorded: Map<String, LastAnswer>) =
        withContext(io) { answers.record(widgetId, recorded) }

    /** Drop the tabs kept of a Mac; [answers] go with the list of Macs (`keep`). */
    fun remove(mac: String) {
        lists[mac] = emptyMap()
        dirty -= mac
        val folder = File(dir, mac)
        onDisk { folder.deleteRecursively() }
    }

    private val Inbound.Terminals.agentTabs: List<TerminalInfo>
        get() = terminals.filter { it.cli.isNotEmpty() }

    private fun entries(mac: String): Map<String, Listed> = lists.getOrPut(mac) {
        val o = read(listFile(mac)) ?: return@getOrPut emptyMap()
        o.keys.mapNotNull { project -> o.string(project)?.let { project to listed(it) } }.toMap()
    }

    private fun listed(frame: String) = Listed(
        frame,
        lazy { (Inbound.parse(frame) as? Inbound.Terminals)?.agentTabs.orEmpty() }
    )

    private fun read(file: File): JsonObject? = file.readJson(JsonObject.serializer())

    private fun save(mac: String) {
        dirty += mac
        flush?.cancel()
        flush = scope.launch {
            delay(FLUSH_DELAY_MS)
            val batch = dirty.mapNotNull { id -> lists[id]?.let { id to it } }
            dirty.clear()
            onDisk {
                for ((id, entry) in batch) {
                    val json = buildJsonObject { entry.forEach { (k, v) -> put(k, v.frame) } }
                    write(listFile(id), json.toString())
                }
            }
        }
    }

    private fun delete(files: List<File>) {
        if (files.isNotEmpty()) onDisk { files.forEach { it.delete() } }
    }

    private fun onDisk(work: () -> Unit) {
        scope.launch { disk.withLock { withContext(io) { work() } } }
    }

    private fun write(file: File, text: String) {
        try {
            file.parentFile?.mkdirs()
            file.writeAtomically(text.toByteArray())
        } catch (e: IOException) {
            file.delete()
        }
    }

    private fun listFile(mac: String) = File(File(dir, mac), "tabs.json")

    private fun screenFile(mac: String, terminal: String) =
        File(File(dir, mac), "${CertPinning.sha256Hex(terminal.toByteArray())}.json")

    private companion object {
        const val FLUSH_DELAY_MS = 2_000L
    }
}
