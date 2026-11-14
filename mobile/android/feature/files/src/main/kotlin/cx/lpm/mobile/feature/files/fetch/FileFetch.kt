package cx.lpm.mobile.feature.files.fetch

import cx.lpm.mobile.core.model.FileChunk
import java.io.File
import kotlin.coroutines.cancellation.CancellationException
import kotlin.coroutines.resume
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Pulls one file off the Mac for the preview sheet, a few byte ranges at a time,
 * into a scratch file the preview then opens. Ranges may land in any order (the Mac
 * reads each on its own thread), so each is written at its own offset. Runs on the
 * main thread; [close] it when done with it.
 */
class FileFetch internal constructor(
    val project: String,
    // Readings of a tapped path, most likely first; the first that exists wins.
    private val candidates: List<String>,
    private val router: FileFetches
) {
    sealed interface Phase {
        data object Loading : Phase

        data class Ready(val file: File, val kind: FilePreviewKind, val truncated: Boolean) : Phase

        data class Failed(val message: String) : Phase
    }

    data class State(
        /** The reading of the path being fetched; see `candidates`. */
        val path: String,
        val phase: Phase = Phase.Loading,
        val received: Long = 0,
        /** Bytes this preview will fetch — the whole file, or the head of a long text. */
        val total: Long? = null,
        /**
         * Where the Mac says the file sits in the project, "" outside it; null until the
         * file arrives, or from a Mac that doesn't say.
         */
        val projectPath: String? = null
    )

    private val mutable = MutableStateFlow(State(candidates.firstOrNull().orEmpty()))
    val state: StateFlow<State> = mutable.asStateFlow()

    /** Called once the fetch is ready or has failed, for callers that aren't screens. */
    var onDone: ((Phase) -> Unit)? = null

    internal var token = router.newToken()
        private set

    private var size = 0L
    private var mtime = 0L
    private var kind = FilePreviewKind.Document
    private var nextOffset = 0L

    // Offset → length of each range asked for and not yet answered.
    private val pending = LinkedHashMap<Long, Long>()
    private var scratch: ScratchFile? = null
    private var stalls = 0
    private var watchdog: Job? = null

    private val path: String get() = mutable.value.path
    private val loading: Boolean get() = mutable.value.phase == Phase.Loading
    private val total: Long? get() = mutable.value.total

    fun start() {
        router.add(this)
        request(0, CHUNK_SIZE)
    }

    fun retry() = restart(candidates.firstOrNull() ?: path)

    /** Stop fetching and delete the scratch file. The sheet calls this on dismiss. */
    fun close() {
        router.remove(token)
        watchdog?.cancel()
        pending.clear()
        scratch?.discard()
        scratch = null
    }

    /** The link dropped: whatever was in flight died with the socket, so ask again. */
    fun resend() {
        pending.forEach { (offset, length) -> send(offset, length) }
    }

    fun cancel(message: String) = fail(message)

    /** Starts the fetch and waits for it to end; cancelling closes it. */
    suspend fun awaitDone(): Phase = try {
        suspendCancellableCoroutine { done ->
            onDone = { phase ->
                onDone = null
                done.resume(phase)
            }
            start()
        }
    } catch (e: CancellationException) {
        close()
        throw e
    }

    internal fun apply(chunk: FileChunk) {
        if (!loading) return
        val length = pending.remove(chunk.offset) ?: return
        val error = chunk.error
        if (error != null) {
            val next = candidates.indexOf(path).let { if (it < 0) candidates.size else it } + 1
            if (chunk.missing && total == null && next < candidates.size) {
                restart(candidates[next])
            } else {
                fail(error)
            }
            return
        }
        stalls = 0
        if (total == null) {
            if (!begin(chunk)) return
        } else if (!kind.isText && (chunk.size != size || chunk.mtime != mtime)) {
            fail(CHANGED)
            return
        }
        scratch?.write(chunk.offset, chunk.data)
        val count = chunk.data.size.toLong()
        mutable.update {
            it.copy(
                received = it.received + count,
                total = if (count < length) minOf(it.total ?: 0, chunk.offset + count) else it.total
            )
        }
        armWatchdog()
        pump()
    }

    private fun restart(path: String) {
        close()
        token = router.newToken()
        mutable.value = State(path)
        nextOffset = 0
        stalls = 0
        start()
    }

    private fun begin(chunk: FileChunk): Boolean {
        size = chunk.size
        mtime = chunk.mtime
        val name = lastPathComponent(chunk.path.ifEmpty { path })
        kind = router.classify(name, chunk.data)
        val total = when {
            kind.isText -> minOf(size, TEXT_CAP)

            size > MAX_BYTES -> {
                fail("This file is over 1 GB — too large to open on this ${router.noun}.")
                return false
            }

            else -> size
        }
        mutable.update { it.copy(total = total, projectPath = chunk.projectPath) }
        nextOffset = chunk.offset + CHUNK_SIZE
        val token = token
        scratch = router.scratch(token, name.ifEmpty { "file" }) {
            if (token == this.token) fail(saveFailed())
        }
        return true
    }

    private fun pump() {
        val total = total ?: return
        while (pending.size < WINDOW && nextOffset < total) {
            val length = minOf(CHUNK_SIZE, total - nextOffset)
            request(nextOffset, length)
            nextOffset += length
        }
        if (pending.isEmpty() && nextOffset >= total) finish()
    }

    private fun finish() {
        watchdog?.cancel()
        val scratch = scratch ?: return fail(UNREADABLE)
        val total = total ?: 0
        val truncated = size > total
        scratch.finish(total) { file ->
            if (this.scratch !== scratch || !loading) return@finish
            val ready = Phase.Ready(file, kind, truncated)
            mutable.update { it.copy(phase = ready) }
            onDone?.invoke(ready)
        }
    }

    private fun fail(message: String) {
        close()
        val failed = Phase.Failed(message)
        mutable.update { it.copy(phase = failed) }
        onDone?.invoke(failed)
    }

    private fun request(offset: Long, length: Long) {
        pending[offset] = length
        send(offset, length)
        armWatchdog()
    }

    private fun send(offset: Long, length: Long) =
        router.send("$token:$offset", project, path, offset, length)

    /**
     * A reply can be lost (a full queue on the Mac, a dropped link): re-ask for
     * whatever is still missing, and give up after a few silent rounds. A Mac that
     * never answers at all is one too old to know the request.
     */
    private fun armWatchdog() {
        watchdog?.cancel()
        watchdog = router.scope.launch {
            delay(STALL_TIMEOUT_MS)
            stalled()
        }
    }

    private fun stalled() {
        if (!loading || pending.isEmpty()) return
        if (!router.isReady) return armWatchdog()
        stalls += 1
        if (stalls > MAX_STALLS) {
            fail(
                if (total == null) {
                    "Your Mac didn't send the file. Make sure lpm on your Mac is up to date."
                } else {
                    "Your Mac stopped sending the file."
                }
            )
            return
        }
        resend()
        armWatchdog()
    }

    private fun saveFailed() = "Couldn't save the file on this ${router.noun}."

    companion object {
        const val CHUNK_SIZE: Long = 256L * 1024
        const val WINDOW = 8
        const val MAX_BYTES: Long = 1L shl 30
        const val TEXT_CAP: Long = 1L shl 20
        internal const val STALL_TIMEOUT_MS = 20_000L
        private const val MAX_STALLS = 2
        private const val CHANGED = "The file changed while it was loading."
        private const val UNREADABLE = "Couldn't read the file."
    }
}
