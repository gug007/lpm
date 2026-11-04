package cx.lpm.mobile.feature.notes.chat

import android.content.ClipData
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.model.NoteAttachment
import cx.lpm.mobile.core.model.NoteMessage
import cx.lpm.mobile.core.navigation.NoteChatKey
import cx.lpm.mobile.core.ui.dictation.rememberDictationStart
import cx.lpm.mobile.feature.notes.R
import cx.lpm.mobile.feature.notes.attachment.NoteAttachmentActions
import cx.lpm.mobile.feature.notes.attachment.NoteImageViewer
import cx.lpm.mobile.feature.notes.attachment.shareNoteAttachment
import cx.lpm.mobile.feature.notes.composer.NotesComposerActions
import cx.lpm.mobile.feature.notes.composer.NotesDictation
import cx.lpm.mobile.feature.notes.composer.rememberNoteCamera
import kotlinx.coroutines.launch

/** A notebook chat wired to its ViewModel, the pickers, the sheets and the share sheet. */
@Composable
fun NoteChatRoute(
    key: NoteChatKey,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NoteChatViewModel = hiltViewModel<NoteChatViewModel, NoteChatViewModel.Factory>(
        creationCallback = { it.create(key) }
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val take by viewModel.dictationState.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<NoteMessage?>(null) }
    var deleting by remember { mutableStateOf<NoteMessage?>(null) }
    var viewing by remember { mutableStateOf<NoteAttachment?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val clipboard = LocalClipboard.current
    val context = LocalContext.current
    DisposableEffect(viewModel) {
        viewModel.open()
        onDispose {
            viewModel.abandonDictation()
            viewModel.close()
        }
    }
    val dictate = rememberDictationStart(
        needsMicrophone = viewModel.needsMicrophone,
        onStart = viewModel::startDictation,
        onRefuse = viewModel::refuseDictation
    )
    var feltErrors by remember { mutableStateOf(state.errorTick) }
    LaunchedEffect(state.errorTick) {
        if (state.errorTick != feltErrors) haptics.performHapticFeedback(HapticFeedbackType.Reject)
        feltErrors = state.errorTick
    }
    LaunchedEffect(state.draft.warning) {
        if (state.draft.warning != null) haptics.performHapticFeedback(HapticFeedbackType.Reject)
    }
    val photos = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(MAX_PHOTOS)
    ) { uris -> if (uris.isNotEmpty()) viewModel.addPhotos(uris.map(Uri::toString)) }
    val files =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            if (uris.isNotEmpty()) viewModel.addFiles(uris.map(Uri::toString))
        }
    val camera = rememberNoteCamera(viewModel::addCapture)
    val share = { attachment: NoteAttachment, bytes: ByteArray ->
        context.shareNoteAttachment(attachment.name, attachment.mimeType, bytes)
    }

    NoteChatScreen(
        state = state,
        refreshing = refreshing,
        onRefresh = {
            scope.launch {
                refreshing = true
                viewModel.refresh()
                refreshing = false
            }
        },
        modifier = modifier,
        actions = NoteChatActions(
            back = onBack,
            loadMore = viewModel::loadMore,
            clearErrors = viewModel::clearErrors,
            menu = NoteMenuActions(
                edit = { editing = it },
                copy = {
                    scope.launch {
                        clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(null, it.text)))
                    }
                    haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                },
                delete = { deleting = it }
            ),
            attachments = NoteAttachmentActions(
                bytes = viewModel::attachmentBytes,
                fetch = viewModel::fetch,
                share = share,
                view = { viewing = it }
            )
        ),
        composer = NotesComposerActions(
            setText = viewModel::setText,
            send = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                viewModel.send()
            },
            photoLibrary = {
                photos.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                )
            },
            takePhoto = camera,
            chooseFiles = { files.launch(arrayOf("*/*")) },
            remove = viewModel::drop,
            dismissWarning = viewModel::dismissWarning
        ),
        dictation = NotesDictation(
            state = take,
            owner = viewModel.dictationOwner,
            meter = viewModel.dictationMeter,
            start = dictate,
            stop = viewModel::stopDictation,
            cancel = viewModel::cancelDictation
        )
    )

    editing?.let { message ->
        NoteEditSheet(
            text = message.text,
            onSave = { viewModel.edit(message.id, it) },
            onDismiss = { editing = null }
        )
    }
    deleting?.let { message ->
        LpmConfirmationDialog(
            title = stringResource(R.string.notes_note_delete_title),
            message = stringResource(R.string.notes_note_delete_message),
            buttons = listOf(
                AlertButton(stringResource(R.string.notes_delete), AlertRole.Destructive) {
                    haptics.performHapticFeedback(HapticFeedbackType.Reject)
                    viewModel.delete(message.id)
                },
                AlertButton(stringResource(R.string.notes_cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { deleting = null }
        )
    }
    viewing?.let { attachment ->
        val bytes = viewModel.attachmentBytes(attachment.hash)
        NoteImageViewer(
            name = attachment.name,
            bytes = bytes,
            onShare = bytes?.let { { share(attachment, it) } },
            onDismiss = { viewing = null }
        )
    }
}

private const val MAX_PHOTOS = 10
