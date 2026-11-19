package cx.lpm.mobile.feature.files.preview

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.code.CodeEditor
import cx.lpm.mobile.core.designsystem.code.highlightCode
import cx.lpm.mobile.core.designsystem.code.rememberSyntaxColors
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.TopBarTitle
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.FileWriteResult
import cx.lpm.mobile.feature.files.R
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * A small fix made right in the file preview (iOS `FileEditScreen`): the file's text in
 * a code field, saved into the project on the Mac only while the file still holds what
 * was opened here, so a change an agent made meanwhile is never overwritten.
 * [onReopen] reads the file again after a save, or after the Mac's copy changed.
 */
@Composable
internal fun FileEditScreen(
    file: File,
    filename: String,
    onSave: (content: String, base: String, done: (FileWriteResult) -> Unit) -> Unit,
    onReopen: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    val haptics = LocalHapticFeedback.current
    val opened by produceState<FileEdit.Opened?>(null, file) {
        value = withContext(Dispatchers.IO) { FileEdit.open(file) }
    }
    var text by remember(opened) { mutableStateOf(opened?.text.orEmpty()) }
    var saving by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<FileWriteResult?>(null) }
    val current = opened
    val edited = current != null && text != current.text
    BackHandler(onBack = onClose)
    Column(
        modifier
            .fillMaxSize()
            .background(LpmTheme.colors.systemBackground)
    ) {
        LpmTopBar(
            modifier = Modifier.padding(top = 16.dp, bottom = 10.dp),
            windowInsets = WindowInsets(0),
            leading = {
                if (edited) {
                    GlassCapsuleButton(
                        text = stringResource(R.string.files_edit_cancel),
                        onClick = onClose
                    )
                } else {
                    GlassIconButton(
                        icon = painterResource(DesignR.drawable.ic_arrow_back_ios_new),
                        contentDescription = stringResource(R.string.files_edit_back),
                        onClick = onClose
                    )
                }
            },
            trailing = {
                if (saving) {
                    ActivityIndicator()
                } else {
                    GlassCapsuleButton(
                        text = stringResource(R.string.files_edit_save),
                        enabled = edited && !current.unreadable,
                        color = LpmTheme.colors.tint,
                        onClick = {
                            val base = current?.base ?: return@GlassCapsuleButton
                            saving = true
                            haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                            onSave(text, base) { result ->
                                saving = false
                                if (result.sha256 != null) {
                                    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                                    onReopen()
                                } else {
                                    haptics.performHapticFeedback(HapticFeedbackType.Reject)
                                    failure = result
                                }
                            }
                        }
                    )
                }
            }
        ) { TopBarTitle(title = filename) }
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            when {
                current == null -> ActivityIndicator(Modifier.align(Alignment.Center))

                current.unreadable -> EmptyState(
                    title = stringResource(R.string.files_edit_unreadable),
                    icon = painterResource(DesignR.drawable.ic_unknown_document),
                    description = { Text(stringResource(R.string.files_edit_unreadable_message)) },
                    modifier = Modifier.align(Alignment.Center)
                )

                else -> {
                    val syntax = rememberSyntaxColors()
                    val ext = file.extension.lowercase()
                    val highlight =
                        remember(syntax, ext) { { t: String -> highlightCode(t, ext, syntax) } }
                    CodeEditor(
                        text = text,
                        onTextChange = { text = it },
                        highlight = highlight,
                        modifier = Modifier
                            .fillMaxSize()
                            .imePadding()
                    )
                }
            }
        }
    }
    failure?.let { SaveFailedAlert(it, onReopen = onReopen, onDismiss = { failure = null }) }
}

/** "Changed on your Mac" offers to open the file again; any other failure just says why. */
@Composable
private fun SaveFailedAlert(failure: FileWriteResult, onReopen: () -> Unit, onDismiss: () -> Unit) {
    LpmAlert(
        title = stringResource(
            if (failure.changed) R.string.files_edit_changed else R.string.files_edit_failed
        ),
        message = failure.error.orEmpty(),
        buttons = if (failure.changed) {
            listOf(
                AlertButton(stringResource(R.string.files_edit_open_again)) { onReopen() },
                AlertButton(stringResource(R.string.files_edit_keep_editing), AlertRole.Cancel)
            )
        } else {
            listOf(AlertButton(stringResource(R.string.files_edit_ok), AlertRole.Cancel))
        },
        onDismissRequest = onDismiss
    )
}
