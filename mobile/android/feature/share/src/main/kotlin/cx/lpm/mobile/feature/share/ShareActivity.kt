package cx.lpm.mobile.feature.share

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.core.content.IntentCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * "Send to lpm" in the system share sheet (iOS's share extension), in the app's own
 * process: it lists what the app last learned of each Mac and sends over a short link
 * of the app's own.
 */
@AndroidEntryPoint
class ShareActivity : ComponentActivity() {
    private val viewModel: ShareViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        viewModel.start(intent.sharedInput())
        setContent {
            val state by viewModel.uiState.collectAsStateWithLifecycle()
            val actions = remember {
                ShareActions(
                    note = viewModel::setNote,
                    mac = viewModel::selectMac,
                    project = viewModel::setProject,
                    destination = viewModel::setDestination,
                    agent = viewModel::setAgent,
                    send = viewModel::send,
                    dismissFailure = viewModel::dismissFailure,
                    cancel = ::finish,
                    done = ::finish
                )
            }
            LpmTheme {
                ShareSheet(state, actions)
            }
        }
    }
}

/** The text, images and title another app put in its `ACTION_SEND(_MULTIPLE)` intent. */
internal fun Intent.sharedInput(): SharedInput {
    val multiple = action == Intent.ACTION_SEND_MULTIPLE
    val texts = if (multiple) getCharSequenceArrayListExtra(Intent.EXTRA_TEXT) else null
    val text = getCharSequenceExtra(Intent.EXTRA_TEXT)
    val streams = if (multiple) {
        IntentCompat.getParcelableArrayListExtra(this, Intent.EXTRA_STREAM, Uri::class.java)
    } else {
        listOfNotNull(IntentCompat.getParcelableExtra(this, Intent.EXTRA_STREAM, Uri::class.java))
    }
    // A share sheet may hand the streams over only in the clip.
    val clipped = clipData?.let { clip -> List(clip.itemCount) { clip.getItemAt(it).uri } }
    val title = getCharSequenceExtra(Intent.EXTRA_TITLE)
        ?: getCharSequenceExtra(Intent.EXTRA_SUBJECT)
    return SharedInput(
        texts = (texts ?: listOfNotNull(text)).map(CharSequence::toString),
        streams = streams.orEmpty().ifEmpty { clipped.orEmpty().filterNotNull() }
            .map(Uri::toString),
        title = title?.toString()
    )
}
