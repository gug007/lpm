package cx.lpm.mobile.feature.memory.create

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.GlassCapsuleButton
import cx.lpm.mobile.core.designsystem.component.ListCard
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListSectionFooter
import cx.lpm.mobile.core.designsystem.component.ListSectionHeader
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.LpmTopBar
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.TextFieldRow
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.PresentationScope
import cx.lpm.mobile.feature.memory.R
import kotlinx.coroutines.delay

/**
 * "New Memory Session" (iOS `MemoryCreateSheet`). [ownerLabel] names the project these
 * sessions belong to; [onOpen] opens the new session (or the one already by that name)
 * once the sheet has slid away.
 */
@Composable
fun MemoryCreateSheet(
    project: String,
    ownerLabel: String,
    onOpen: (String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    session: SessionKey = SessionKey.Live
) {
    PresentationScope {
        MemoryCreateContent(project, ownerLabel, session, onOpen, onDismiss, modifier)
    }
}

@Composable
internal fun MemoryCreateContent(
    project: String,
    ownerLabel: String,
    session: SessionKey,
    onOpen: (String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: MemoryCreateViewModel =
        hiltViewModel<MemoryCreateViewModel, MemoryCreateViewModel.Factory>(
            creationCallback = { it.create(project, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val sheet = rememberModalSheetState()
    val open by rememberUpdatedState(onOpen)
    val focus = remember { FocusRequester() }
    LaunchedEffect(focus) {
        delay(FOCUS_DELAY_MS)
        focus.requestFocus()
    }
    LaunchedEffect(state.opened) {
        val name = state.opened ?: return@LaunchedEffect
        sheet.dismiss { open(name) }
    }
    ModalSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        state = sheet,
        dismissible = !state.saving
    ) {
        CreateBar(state, onCancel = { sheet.dismiss(onDismiss) }, onCreate = viewModel::create)
        Column(
            Modifier
                .fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(top = ListDefaults.ContentTopPadding)
                .padding(horizontal = ListDefaults.Margin)
        ) {
            ListSectionHeader(
                stringResource(R.string.memory_create_header),
                style = ListHeaderStyle.Title
            )
            ListCard {
                TextFieldRow(
                    value = state.title,
                    onValueChange = viewModel::setTitle,
                    placeholder = stringResource(R.string.memory_create_placeholder),
                    fieldModifier = Modifier.focusRequester(focus),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { viewModel.create() })
                )
            }
            CreateFooter(state, ownerLabel)
        }
    }
    state.saveError?.let { error ->
        LpmAlert(
            title = stringResource(R.string.memory_create_failed),
            message = error,
            buttons = listOf(AlertButton(stringResource(R.string.ok), AlertRole.Cancel)),
            onDismissRequest = viewModel::dismissError
        )
    }
}

@Composable
private fun CreateBar(state: MemoryCreateUiState, onCancel: () -> Unit, onCreate: () -> Unit) {
    LpmTopBar(
        title = stringResource(R.string.memory_create_title),
        modifier = Modifier.padding(top = 16.dp),
        windowInsets = WindowInsets(0),
        leading = {
            GlassCapsuleButton(
                text = stringResource(R.string.cancel),
                onClick = onCancel,
                enabled = !state.saving
            )
        },
        trailing = {
            if (state.saving) {
                Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                    ActivityIndicator(size = ActivityIndicatorSize.Small)
                }
            } else {
                GlassCapsuleButton(
                    text = stringResource(R.string.memory_create_confirm),
                    onClick = onCreate,
                    enabled = state.slug.isNotEmpty(),
                    textStyle = LpmTheme.typography.headline
                )
            }
        }
    )
}

/** The name agents will resume it by, and what Create will do with it. */
@Composable
private fun CreateFooter(state: MemoryCreateUiState, ownerLabel: String) {
    if (state.slug.isEmpty()) {
        ListSectionFooter(stringResource(R.string.memory_create_hint))
        return
    }
    val colors = LpmTheme.colors
    val style = LpmTheme.typography.footnote.copy(lineHeight = 16.sp)
    Column(
        Modifier
            .fillMaxWidth()
            .padding(
                start = ListDefaults.RowPadding,
                end = ListDefaults.RowPadding,
                top = 8.8.dp,
                bottom = 12.5.dp
            ),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = state.slug,
            style = style.copy(fontFamily = FontFamily.Monospace),
            color = colors.label
        )
        Text(
            text = if (state.exists) {
                stringResource(R.string.memory_create_exists, ownerLabel)
            } else {
                stringResource(R.string.memory_create_pick_up, ownerLabel)
            },
            style = style,
            color = colors.secondaryLabel
        )
    }
}

private const val FOCUS_DELAY_MS = 350L
