package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.ui.graphics.ImageBitmap
import cx.lpm.mobile.core.data.dictation.DictationEngine
import cx.lpm.mobile.core.data.dictation.DictationFailure
import cx.lpm.mobile.core.data.dictation.DictationMeter
import cx.lpm.mobile.core.data.dictation.DictationResult
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope

/** Records what the composer asks of the session. */
class FakeLink : ComposerLink {
    override var selfDeviceId: String? = "phone-1"
    override var isReady = true
    override var takesFilesInPieces = false
    override val deviceNoun = "phone"

    val drafts = mutableListOf<String>()
    val uploads = mutableListOf<Upload>()
    val transforms = mutableListOf<Transform>()
    val clearedRoutes = mutableListOf<String?>()
    val steps = mutableListOf<String>()
    private var transformCount = 0

    data class Upload(val b64: String, val mime: String, val name: String?, val reqId: String)

    data class Transform(
        val instruction: String,
        val text: String,
        val variants: Int,
        val reqId: String
    )

    override fun sendDraft(termId: String, text: String) {
        drafts += text
    }

    override fun sendUpload(
        termId: String,
        b64: String,
        mime: String,
        name: String?,
        reqId: String
    ) {
        uploads += Upload(b64, mime, name, reqId)
    }

    override fun runTransform(
        termId: String,
        project: String,
        instruction: String,
        text: String,
        variants: Int
    ): String {
        val reqId = "rw-${++transformCount}"
        transforms += Transform(instruction, text, variants, reqId)
        return reqId
    }

    override fun clearTransformRoute(reqId: String?) {
        clearedRoutes += reqId
    }

    override fun uploadBegin(termId: String, name: String, bytes: Long, reqId: String) {
        steps += "begin $name $bytes"
    }

    override fun uploadChunk(
        termId: String,
        uploadId: String,
        offset: Long,
        b64: String,
        reqId: String
    ) {
        steps += "chunk $uploadId $offset ${java.util.Base64.getDecoder().decode(b64).size}"
    }

    override fun uploadDone(termId: String, uploadId: String, reqId: String) {
        steps += "done $uploadId"
    }

    override fun uploadAbort(termId: String, uploadId: String) {
        steps += "abort $uploadId"
    }
}

/** Picks are names; "video:" picks are videos and "bad:" ones can't be read. */
class FakeMedia(private val dir: File) : ComposerMedia {
    val discarded = mutableListOf<File>()

    override fun isVideo(source: PickedUri) = source.value.startsWith("video:")

    override fun displayName(source: PickedUri) = source.value.substringAfter(':')

    override fun encodeImage(source: PickedUri): EncodedImage? =
        if (source.value.startsWith("bad:")) null else EncodedImage("b64-${source.value}", null)

    override fun copyToScratch(source: PickedUri): File? {
        if (source.value.startsWith("bad:")) return null
        val name = displayName(source)
        val size = name.substringAfter('-', "").substringBefore('.').toIntOrNull() ?: 10
        return File(File(dir, source.value.hashCode().toString()).apply { mkdirs() }, name)
            .apply { writeBytes(ByteArray(size) { it.toByte() }) }
    }

    override fun mime(file: File) = if (file.extension ==
        "mov"
    ) {
        "video/quicktime"
    } else {
        "application/octet-stream"
    }

    override fun videoThumbnail(file: File): ImageBitmap? = null

    override fun size(file: File): Long? = file.takeIf { it.isFile }?.length()

    override fun readPiece(file: File, offset: Long, length: Long): ByteArray? =
        file.readBytes().copyOfRange(offset.toInt(), (offset + length).toInt())

    override fun readAll(file: File): ByteArray? = file.readBytes()

    override fun discard(file: File) {
        discarded += file
        file.parentFile?.deleteRecursively()
    }
}

/** A composer on the test scheduler, so its timers move with virtual time. */
@OptIn(ExperimentalCoroutinesApi::class)
fun TestScope.composer(link: FakeLink, media: FakeMedia): ComposerStore {
    val dispatcher = StandardTestDispatcher(testScheduler)
    return ComposerStore(
        termId = "t1",
        project = "storefront",
        label = "Claude",
        link = link,
        media = media,
        parent = backgroundScope,
        io = dispatcher,
        now = { testScheduler.currentTime }
    )
}

internal class FakeDictationEngine : DictationEngine {
    var heard: ((String) -> Unit)? = null
    var finished: ((DictationResult) -> Unit)? = null

    override fun start(
        meter: DictationMeter,
        heard: (String) -> Unit,
        finished: (DictationResult) -> Unit
    ): DictationFailure? {
        this.heard = heard
        this.finished = finished
        return null
    }

    override fun stop() = Unit

    override fun cancel() = Unit
}
