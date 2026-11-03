package cx.lpm.mobile.feature.terminal.composer

import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.navigation.PresentationScope
import cx.lpm.mobile.feature.terminal.history.HistorySheet

private const val MAX_PHOTOS = 10

/** What differs between a terminal's composer and a reply box. */
internal class ComposerMode(
    val look: ComposerLook,
    /** Where a sent message goes instead of the terminal. */
    val onSend: ((String) -> Unit)? = null,
    val onPreviewFile: ((String) -> Unit)? = null,
    val onHideTerminalKeyboard: () -> Unit = {},
    /** Find in the terminal above, offered in the "+" menu. */
    val onFind: (() -> Unit)? = null,
    /** The project's Commands screen, from the `/` menu's "Manage commands". */
    val onManageCommands: (() -> Unit)? = null,
    /** The command editor seeded with the field's text, from Send's "Save as command". */
    val onSaveAsCommand: ((String) -> Unit)? = null,
    val memorySheet: (
        @Composable (
            project: String,
            cli: String,
            onInvocation: (String) -> Unit,
            onDismiss: () -> Unit
        ) -> Unit
    )? = null,
    val duplicateSheet: (
        @Composable (
            prompt: String,
            copies: Int,
            onDuplicated: () -> Unit,
            onDismiss: () -> Unit
        ) -> Unit
    )? = null
)

/** A composer with its pickers, sheets and alerts. */
@Composable
internal fun ComposerHost(
    target: ComposerTarget,
    mode: ComposerMode,
    modifier: Modifier = Modifier,
    viewModel: ComposerViewModel = hiltViewModel<ComposerViewModel, ComposerViewModel.Factory>(
        key = "composer:${target.termId}",
        creationCallback = { it.create(target) }
    )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val focusRequester = remember { FocusRequester() }
    var showHistory by rememberSaveable { mutableStateOf(false) }
    var showActions by rememberSaveable { mutableStateOf(false) }
    var showMemory by rememberSaveable { mutableStateOf(false) }
    var duplicates by remember { mutableStateOf<DuplicateSeed?>(null) }
    var focusField by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { viewModel.onAppear() }
    LaunchedEffect(focusField, showHistory, showMemory) {
        if (focusField && !showHistory && !showMemory) {
            focusRequester.requestFocus()
            focusField = false
        }
    }

    val photos =
        rememberLauncherForActivityResult(
            ActivityResultContracts.PickMultipleVisualMedia(MAX_PHOTOS)
        ) { uris ->
            if (uris.isNotEmpty()) viewModel.addPicked(uris.map { PickedUri(it.toString()) })
        }
    val documents =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            viewModel.addFiles(uris.map { PickedUri(it.toString()) })
        }
    val camera = rememberCameraCapture(onPhoto = viewModel::addImage)
    val hideKeyboard = {
        keyboard?.hide()
        focusManager.clearFocus()
        mode.onHideTerminalKeyboard()
    }
    val send = {
        if (viewModel.send(
                mode.onSend
            )
        ) {
            haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        }
    }

    TerminalComposer(
        state = state,
        input = viewModel.input,
        look = mode.look,
        focusRequester = focusRequester,
        modifier = modifier,
        callbacks = ComposerCallbacks(
            onFocusChanged = viewModel::setFocused,
            onSend = send,
            onHideKeyboard = hideKeyboard,
            onKey = viewModel::key,
            onSwitchTab = viewModel::switchTab,
            onCloseTab = viewModel::closeTab,
            onRetryUpload = viewModel::retryUpload,
            onRemoveAttachment = viewModel::removeAttachment,
            onCancelRewrite = viewModel::cancelRewrite,
            onPickSlash = {
                viewModel.pickSlash(it)
                focusField = true
            },
            mentions = MentionActions(
                pickPath = {
                    viewModel.pickPath(it)
                    focusField = true
                },
                pickBranch = {
                    viewModel.pickBranch(it)
                    focusField = true
                },
                previewFile = mode.onPreviewFile,
                pickTerminalOutput = {
                    viewModel.pickTerminalOutput()
                    focusField = true
                },
                pickServiceLog = viewModel::pickServiceLog
            ),
            onManageCommands = mode.onManageCommands
        ),
        plusMenu = {
            ComposerPlusMenu(
                actions = PlusMenuActions(
                    onRewrite = { showActions = true },
                    onPhotoLibrary = {
                        photos.launch(
                            PickVisualMediaRequest(
                                ActivityResultContracts.PickVisualMedia.ImageAndVideo
                            )
                        )
                    },
                    onTakePhoto = camera,
                    onChooseFiles = { documents.launch(arrayOf("*/*")) },
                    onPasteImage = {
                        context.clipboardImage()?.let { viewModel.addImage(PickedUri(it)) }
                    },
                    onMemory = if (state.memoryAvailable && mode.memorySheet != null) {
                        { showMemory = true }
                    } else {
                        null
                    },
                    onSaveAsCommand = mode.onSaveAsCommand?.takeIf {
                        state.lpmCommands
                    }?.let { save ->
                        { save(viewModel.draftText) }
                    },
                    onNewPrompt = viewModel::newTab,
                    onHistory = { showHistory = true },
                    onFind = mode.onFind
                ),
                canRewrite = state.canRewrite,
                enabled = mode.look.enabled && !state.composer.transforming,
                hasText = state.composer.text.isNotBlank(),
                hasClipboardImage = context::clipboardHasImage
            )
        },
        sendButton = {
            ComposerSendButton(
                canSend = mode.look.enabled && state.canSend,
                menuUseful = mode.look.enabled && state.sendMenuUseful,
                onSend = send,
                onSaveDraft = viewModel::saveDraft,
                onTerminal = state.terminalTools,
                onRunInDuplicates = if (state.terminalTools && mode.duplicateSheet != null) {
                    { copies ->
                        duplicates = DuplicateSeed(copies, viewModel.input.text.toString())
                    }
                } else {
                    null
                }
            )
        }
    )

    if (showHistory) {
        PresentationScope {
            HistorySheet(
                session = target.session,
                onLoad = {
                    viewModel.load(it)
                    focusField = true
                },
                onSendNow = { viewModel.sendRaw(it, mode.onSend) },
                onDismiss = { showHistory = false }
            )
        }
    }
    if (showActions) {
        ComposerActionsSheet(
            actions = state.composerActions,
            variants = state::variants,
            onVariantsChange = viewModel::setVariants,
            onRun = viewModel::startRewrite,
            onDismiss = { showActions = false }
        )
    }
    if (state.composer.showVariants) {
        ComposerVariantsSheet(
            variants = state.composer.variants,
            generating = state.composer.transforming,
            onUse = viewModel::applyVariant,
            onCancel = viewModel::cancelRewrite,
            onDismiss = viewModel::variantsDismissed
        )
    }
    val memory = mode.memorySheet
    if (showMemory && memory != null) {
        memory(
            target.project,
            state.terminalCli,
            {
                viewModel.insertInvocation(it)
                focusField = true
            },
            { showMemory = false }
        )
    }
    val duplicateSheet = mode.duplicateSheet
    duplicates?.let { seed ->
        if (duplicateSheet != null) {
            duplicateSheet(
                seed.prompt,
                maxOf(1, seed.count - 1),
                { viewModel.sendRaw(seed.prompt) },
                { duplicates = null }
            )
        }
    }
    ComposerAlerts(
        sendWarning = state.sendWarning,
        commandNotice = state.commandNotice,
        onDismissCommandNotice = viewModel::dismissCommandNotice,
        rewriteError = state.composer.transformError,
        uploadError = state.composer.uploadError,
        onDismissWarning = viewModel::dismissWarning,
        onDismissRewriteError = viewModel::dismissRewriteError,
        onDismissUploadError = viewModel::dismissUploadError
    )
}

/** "Run in duplicates": the prompt to run and the total copies (this terminal is the first). */
private class DuplicateSeed(val count: Int, val prompt: String)

private fun Context.clipboardHasImage(): Boolean = getSystemService(
    ClipboardManager::class.java
)?.primaryClipDescription?.hasMimeType("image/*") ==
    true

private fun Context.clipboardImage(): String? {
    if (!clipboardHasImage()) return null
    return getSystemService(
        ClipboardManager::class.java
    )?.primaryClip?.getItemAt(0)?.uri?.toString()
}
