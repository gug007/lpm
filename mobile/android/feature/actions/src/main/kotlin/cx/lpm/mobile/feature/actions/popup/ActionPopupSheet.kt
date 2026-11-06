package cx.lpm.mobile.feature.actions.popup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import cx.lpm.mobile.core.data.actions.ActionPopupPhase
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.SheetScaffold
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.ActionPopupContent
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.relativeAgo
import cx.lpm.mobile.core.navigation.PresentationScope
import cx.lpm.mobile.core.ui.tickingNow
import cx.lpm.mobile.core.web.ActionPopupWebView
import cx.lpm.mobile.feature.actions.R
import kotlinx.coroutines.delay

/**
 * An action's popup card (iOS `ActionPopupSheet`), opened from a long press on its
 * button: the page the Mac made and how old it is, refreshed with Refresh and every
 * `refresh` seconds while it's open.
 */
@Composable
fun ActionPopupSheet(
    project: String,
    action: Action,
    session: SessionKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    PresentationScope { ActionPopupSheetContent(project, action, session, onDismiss, modifier) }
}

@Composable
private fun ActionPopupSheetContent(
    project: String,
    action: Action,
    session: SessionKey,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ActionPopupViewModel =
        hiltViewModel<ActionPopupViewModel, ActionPopupViewModel.Factory>(
            creationCallback = { it.create(project, action, session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val sheet = rememberModalSheetState(medium = true)
    val refresh = state.popup.content?.refresh ?: 0
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(refresh, lifecycle) {
        if (refresh <= 0) return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                delay(refresh * 1_000L)
                viewModel.tick()
            }
        }
    }
    ModalSheet(onDismissRequest = onDismiss, modifier = modifier, state = sheet) {
        ActionPopupScreen(
            state = state,
            project = project,
            action = action.name,
            onRefresh = viewModel::reload,
            onDone = { sheet.dismiss(onDismiss) },
            onPageFail = viewModel::pageFailed
        )
    }
}

/** The sheet's chrome and body: a spinner, the page, or why there's none. */
@Composable
internal fun ActionPopupScreen(
    state: ActionPopupUiState,
    project: String,
    action: String,
    onRefresh: () -> Unit,
    onDone: () -> Unit,
    onPageFail: () -> Unit
) {
    SheetScaffold(
        title = state.title,
        onDone = onDone,
        leading = {
            GlassIconButton(
                icon = painterResource(DesignR.drawable.ic_refresh),
                contentDescription = stringResource(R.string.popup_refresh),
                onClick = onRefresh,
                enabled = state.popup.canReload,
                iconSize = 22.dp,
                busy = state.popup.inFlight && state.popup.content != null
            )
        },
        titleTrailing = state.popup.content?.updatedAt?.takeIf { it > 0 }?.let { updatedAt ->
            { Age(updatedAt) }
        }
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            when (val phase = state.popup.phase) {
                ActionPopupPhase.Loading -> Box(
                    Modifier
                        .fillMaxWidth()
                        .height(state.height.dp),
                    contentAlignment = Alignment.Center
                ) {
                    ActivityIndicator()
                }

                is ActionPopupPhase.Failed -> Failure(phase, state.height, onRefresh)

                is ActionPopupPhase.Shown -> Page(
                    content = phase.content,
                    state = state,
                    project = project,
                    action = action,
                    onPageFail = onPageFail
                )
            }
        }
    }
}

@Composable
private fun Failure(failed: ActionPopupPhase.Failed, height: Int, onRetry: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(min = height.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically)
    ) {
        Text(
            text = failed.message,
            style = LpmTheme.typography.body,
            color = LpmTheme.colors.secondaryLabel,
            textAlign = TextAlign.Center
        )
        if (failed.retry) {
            CapsuleButton(
                text = stringResource(R.string.popup_retry),
                onClick = onRetry,
                prominent = true,
                textStyle = LpmTheme.typography.body
            )
        }
    }
}

@Composable
private fun Page(
    content: ActionPopupContent,
    state: ActionPopupUiState,
    project: String,
    action: String,
    onPageFail: () -> Unit
) {
    val colors = LpmTheme.colors
    val payload = remember(content, project, action, colors) {
        ActionPopupPayload.bootstrap(content, project, action, colors)
    }
    val push = remember(content) { ActionPopupPayload.push(content) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ActionPopupWebView(
            html = content.html.orEmpty(),
            payload = payload,
            push = push,
            page = state.popup.page,
            pushes = state.popup.pushes,
            onFailure = onPageFail,
            modifier = Modifier
                .fillMaxWidth()
                .height(state.height.dp)
        )
        state.popup.note?.let { note ->
            Text(
                text = note,
                style = LpmTheme.typography.footnote,
                color = colors.orange,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

/** How old the page's data is, beside the title, kept current. */
@Composable
private fun Age(updatedAt: Long) {
    val now = tickingNow(periodMs = AGE_TICK_MS)
    Text(
        text = relativeAgo(updatedAt / 1_000, now / 1_000),
        style = LpmTheme.typography.subheadline,
        color = LpmTheme.colors.secondaryLabel,
        maxLines = 1
    )
}

private const val AGE_TICK_MS = 5_000L
