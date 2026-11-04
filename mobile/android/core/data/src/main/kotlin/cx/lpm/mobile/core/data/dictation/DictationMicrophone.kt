package cx.lpm.mobile.core.data.dictation

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.util.Base64
import kotlin.concurrent.thread
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

private const val SAMPLE_RATE = 16_000
private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT

// A tenth of a second of 16-bit samples.
private const val PIECE_BYTES = 3_200
private const val CLOSE_WAIT_MS = 200L

// -50 dB (a quiet room) to -10 dB (close speech), as 0..1.
private const val QUIET_DB = -50f
private const val RANGE_DB = 40f
private const val FULL_SCALE = 32_768f
private const val SILENCE = 0.000_01f

/** The microphone during a take, in what the Mac's VoiceToText reads. */
internal interface DictationMicrophone {
    /**
     * Starts sending [onPiece] base64 of 16-bit little-endian mono samples at 16 kHz,
     * on a thread of its own, and answers whether it could.
     */
    fun open(meter: DictationMeter, onPiece: (String) -> Unit): Boolean

    /** Ends the take: [onPiece] has had everything by the time this returns. */
    fun close()
}

internal class AudioRecordMicrophone : DictationMicrophone {
    private var record: AudioRecord? = null
    private var reader: Thread? = null

    @Volatile
    private var listening = false

    // The mic's button asks for the permission before a take starts.
    @SuppressLint("MissingPermission")
    override fun open(meter: DictationMeter, onPiece: (String) -> Unit): Boolean {
        val size = max(
            AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING),
            PIECE_BYTES * 2
        )
        val record = runCatching {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                CHANNEL,
                ENCODING,
                size
            )
        }.getOrNull() ?: return false
        val started = record.state == AudioRecord.STATE_INITIALIZED &&
            runCatching { record.startRecording() }.isSuccess
        if (!started) {
            record.release()
            return false
        }
        this.record = record
        listening = true
        reader = thread(name = "dictation-mic") { read(record, meter, onPiece) }
        return true
    }

    override fun close() {
        if (!listening) return
        listening = false
        record?.stop()
        reader?.join(CLOSE_WAIT_MS)
        record?.release()
        record = null
        reader = null
    }

    private fun read(record: AudioRecord, meter: DictationMeter, onPiece: (String) -> Unit) {
        val piece = ByteArray(PIECE_BYTES)
        while (listening) {
            val count = record.read(piece, 0, piece.size)
            if (count <= 0) return
            meter.level = level(piece, count)
            onPiece(Base64.getEncoder().encodeToString(piece.copyOf(count)))
        }
    }

    private fun level(piece: ByteArray, count: Int): Float {
        val samples = count / 2
        if (samples == 0) return 0f
        var sum = 0f
        for (i in 0 until samples) {
            val low = piece[i * 2].toInt() and 0xFF
            val sample = (piece[i * 2 + 1].toInt() shl 8 or low) / FULL_SCALE
            sum += sample * sample
        }
        val decibels = 20 * log10(max(sqrt(sum / samples), SILENCE))
        return ((decibels - QUIET_DB) / RANGE_DB).coerceIn(0f, 1f)
    }
}
