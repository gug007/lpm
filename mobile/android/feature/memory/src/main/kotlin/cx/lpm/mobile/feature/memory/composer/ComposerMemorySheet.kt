package cx.lpm.mobile.feature.memory.composer

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.ModalSheetState
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.AppAppearance
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.MemorySessionKey
import cx.lpm.mobile.core.navigation.PresentationScope
import cx.lpm.mobile.core.navigation.SheetStack
import cx.lpm.mobile.core.navigation.rememberSheetNavigator
import cx.lpm.mobile.core.ui.HapticEffect
import cx.lpm.mobile.feature.memory.R
import cx.lpm.mobile.feature.memory.session.MemorySessionRoute

/** A page of the picker's sheet: the list, or a session previewed from it. */
private sealed interface PickerPage {
    data object Picker : PickerPage

    data class Session(val name: String, val title: String) : PickerPage
}

/**
 * The composer's session-memory picker (iOS `ComposerMemorySheet`, the desktop
 * composer's brain panel). [onInvocation] gets the text to put in the field: the
 * terminal CLI's own call of the lpm-memory skill. The eye previews a session inside
 * the sheet, as iOS pushes it in the sheet's own navigation stack.
 */
@Composable
fun ComposerMemorySheet(
    project: String,
    cli: String,
    onInvocation: (String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    session: SessionKey = SessionKey.Live
) {
    // A sheet that sets no color scheme of its own takes the app's, not the terminal's.
    PresentationScope {
        AppAppearance {
            val sheet = rememberModalSheetState()
            val pages = rememberSheetNavigator<PickerPage>(PickerPage.Picker)
            ModalSheet(onDismissRequest = onDismiss, modifier = modifier, state = sheet) {
                SheetStack(pages) { page ->
                    when (page) {
                        PickerPage.Picker -> PickerPageContent(
                            project = project,
                            cli = cli,
                            session = session,
                            sheet = sheet,
                            onInvocation = onInvocation,
                            onDismiss = onDismiss,
                            onPreview = { pages.push(PickerPage.Session(it.name, it.title)) }
                        )

                        is PickerPage.Session -> MemorySessionRoute(
                            key = MemorySessionKey(project, page.name, page.title, session),
                            onBack = pages::back,
                            modifier = Modifier.padding(top = 16.dp),
                            windowInsets = WindowInsets(0)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PickerPageContent(
    project: String,
    cli: String,
    session: SessionKey,
    sheet: ModalSheetState,
    onInvocation: (String) -> Unit,
    onDismiss: () -> Unit,
    onPreview: (PickerRowUi) -> Unit,
    viewModel: ComposerMemoryViewModel =
        hiltViewModel<ComposerMemoryViewModel, ComposerMemoryViewModel.Factory>(
            creationCallback = { it.create(project, cli, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = LocalHapticFeedback.current
    var deleting by remember { mutableStateOf<PickerRowUi?>(null) }
    LaunchedEffect(viewModel) { viewModel.load() }
    HapticEffect(state.feedback)

    fun pick(name: String) {
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        onInvocation(viewModel.invocation(name))
        sheet.dismiss(onDismiss)
    }

    ComposerMemoryPicker(
        state = state,
        actions = PickerActions(
            cancel = { sheet.dismiss(onDismiss) },
            remember = { pick("") },
            pick = { pick(it.name) },
            preview = onPreview,
            delete = { deleting = it },
            search = viewModel::setQuery
        )
    )
    deleting?.let { row ->
        LpmConfirmationDialog(
            title = stringResource(R.string.memory_delete_title),
            message = stringResource(R.string.memory_picker_delete_message, row.title),
            buttons = listOf(
                AlertButton(stringResource(R.string.delete), AlertRole.Destructive) {
                    haptics.performHapticFeedback(HapticFeedbackType.Reject)
                    viewModel.delete(row.name)
                },
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { deleting = null }
        )
    }
}
