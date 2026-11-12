package cx.lpm.mobile.feature.files.fetch

import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.numberLong
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.TestSession
import java.io.File
import java.nio.file.Files
import java.util.Base64
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.serialization.json.JsonObject

/** The types the platform knows for the extensions these tests name. */
val TEST_MIME = mapOf(
    "png" to "image/png",
    "pdf" to "application/pdf",
    "mp4" to "video/mp4",
    "ts" to "video/mp2ts",
    "svg" to "image/svg+xml",
    "txt" to "text/plain"
)

/** File fetches in a session paired with a Mac at `ready`, scratch copies in a temp folder. */
class FetchHarness(test: TestScope) {
    val root: File = Files.createTempDirectory("lpm-previews").toFile()
    private var ids = 0
    val space = ScratchSpace(root, StandardTestDispatcher(test.testScheduler), test.backgroundScope)
    val session = TestSession(
        test,
        setOf(
            SessionStore.Factory {
                FileFetches(it, space, "phone", TEST_MIME::get) { "f${++ids}" }
            }
        )
    )
    val socket: FakeSocket = session.connectReady()
    val fetches: FileFetches get() = session.store()

    fun fetch(vararg paths: String, project: String = "storefront"): FileFetch =
        fetches.fetch(project, paths.toList()).also { it.start() }

    /** Every `fileChunk` request sent so far. */
    val requests: List<JsonObject> get() = socket.sentOf("fileChunk")

    fun settle() = session.scheduler.runCurrent()

    /** Moves virtual time on by [millis], the Mac answering each heartbeat ping. */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun advance(millis: Long) {
        var left = millis
        while (left > 0) {
            val step = minOf(left, 1_000)
            session.scheduler.advanceTimeBy(step)
            session.scheduler.runCurrent()
            left -= step
            repeat(socket.sentOf("ping").size - pongs) { socket.receive("""{"t":"pong"}""") }
            pongs = socket.sentOf("ping").size
            settle()
        }
    }

    private var pongs = 0

    /** Answers [request] with its range of [bytes]; [size] and [mtime] describe the file. */
    fun reply(
        request: JsonObject,
        bytes: ByteArray,
        size: Long = bytes.size.toLong(),
        mtime: Long = 1,
        path: String = request.string("path").orEmpty()
    ) {
        val offset = request.numberLong("offset") ?: 0
        val length = request.numberLong("length") ?: 0
        val from = offset.coerceAtMost(bytes.size.toLong()).toInt()
        val to = (offset + length).coerceAtMost(bytes.size.toLong()).toInt()
        val data = Base64.getEncoder().encodeToString(bytes.copyOfRange(from, to))
        socket.receive(
            """{"t":"fileChunk","reqId":"${request.string("reqId")}","ok":true,"path":"$path",""" +
                """"size":$size,"mtime":$mtime,"offset":$offset,"data":"$data"}"""
        )
        settle()
    }

    fun replyError(request: JsonObject, error: String, missing: Boolean = false) {
        socket.receive(
            """{"t":"fileChunk","reqId":"${request.string("reqId")}","ok":false,""" +
                """"missing":$missing,"error":"$error"}"""
        )
        settle()
    }

    /** Answers every request still unanswered, newest first, until none is left. */
    fun serve(bytes: ByteArray, answered: MutableSet<String> = mutableSetOf()) {
        while (true) {
            val open = requests.filter { answered.add(it.string("reqId").orEmpty()) }
            if (open.isEmpty()) return
            open.reversed().forEach { reply(it, bytes) }
        }
    }
}
