package cx.lpm.mobile.feature.projects.ci

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.ButtonRow
import cx.lpm.mobile.core.designsystem.component.EmptyState
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListHeaderStyle
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ListSectionHeader
import cx.lpm.mobile.core.designsystem.component.LpmAlert
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.SheetScaffold
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.AppAppearance
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.navigation.PresentationScope
import cx.lpm.mobile.core.ui.CiStateIcon
import cx.lpm.mobile.feature.projects.ActionRunStep
import cx.lpm.mobile.feature.projects.R
import cx.lpm.mobile.feature.projects.detail.TerminalRowSkeleton
import cx.lpm.mobile.feature.projects.newtab.ActionInputsSlot

/**
 * What the sheet's Fix with … rows do. [start] and [submitInputs] are false while an
 * action's inputs or confirmation are still to come.
 */
internal class CiFixActions(
    val start: (LaunchpadOption) -> Boolean,
    val submitInputs: (Map<String, String>) -> Boolean,
    val confirm: () -> Unit,
    val dismissStep: (ActionRunStep) -> Unit
)

/**
 * Every check on the branch (iOS `GitChecksSheet`), with the desktop menu's ways on:
 * fixing them with any agent the project's New Tab sheet offers, in a new tab, running
 * the failed jobs again, and the checks on GitHub. [actionInputs] asks for an agent
 * action's inputs before it runs.
 */
@Composable
internal fun GitChecksSheet(
    state: GitChecksUiState,
    fix: CiFixActions,
    onRerun: () -> Unit,
    onDismiss: () -> Unit,
    actionInputs: ActionInputsSlot
) {
    PresentationScope {
        AppAppearance {
            val sheet = rememberModalSheetState()
            val haptics = LocalHapticFeedback.current
            val fixing = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                sheet.dismiss(onDismiss)
            }
            ModalSheet(onDismissRequest = onDismiss, state = sheet) {
                SheetScaffold(title = stringResource(R.string.ci_title), onDone = {
                    sheet.dismiss(onDismiss)
                }) {
                    val checks = state.checks
                    if (checks == null) {
                        EmptyState(
                            title = stringResource(R.string.ci_none_title),
                            icon = painterResource(DesignR.drawable.ic_check_circle),
                            description = { Text(stringResource(R.string.ci_none_description)) }
                        )
                    } else {
                        ChecksList(state, checks, onFix = { if (fix.start(it)) fixing() }, onRerun)
                    }
                }
            }
            when (val step = state.step) {
                is ActionRunStep.Inputs -> actionInputs(
                    step.action,
                    { values -> if (fix.submitInputs(values)) fixing() },
                    { fix.dismissStep(step) }
                )

                is ActionRunStep.Confirm -> LpmAlert(
                    title = stringResource(R.string.new_tab_run_confirm, step.action.label),
                    buttons = listOf(
                        AlertButton(stringResource(R.string.new_tab_run)) {
                            fix.confirm()
                            fixing()
                        },
                        AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
                    ),
                    onDismissRequest = { fix.dismissStep(step) }
                )

                null -> Unit
            }
        }
    }
}

@Composable
private fun ChecksList(
    state: GitChecksUiState,
    checks: GitChecks,
    onFix: (LaunchpadOption) -> Unit,
    onRerun: () -> Unit
) {
    val uri = LocalUriHandler.current
    val colors = LpmTheme.colors
    Column(Modifier.verticalScroll(rememberScrollState())) {
        Column(Modifier.padding(horizontal = ListDefaults.Margin)) {
            ListSectionHeader(
                text = checks.heading,
                style = ListHeaderStyle.Title,
                modifier = Modifier.padding(top = 8.dp)
            )
            checks.subheading?.takeIf { it.isNotEmpty() }?.let {
                Text(
                    text = it,
                    style = LpmTheme.typography.footnote,
                    color = colors.secondaryLabel,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }
        }
        ListSection(footer = state.unpushedNote) {
            checks.sorted.forEach { check -> CheckRow(check, onOpen = { uri.openUri(check.url) }) }
        }
        ListSection(footer = state.rerunError, footerColor = colors.red) {
            if (checks.failed > 0 && checks.fixPrompt != null && state.canFix) {
                val tabs = state.fixTabs
                if (tabs == null) TerminalRowSkeleton() else CiFixRows(tabs, onFix)
            }
            if (checks.failingRunIds.isNotEmpty()) {
                ListRow(
                    onClick = onRerun,
                    enabled = !state.rerunning,
                    leading = { RowIcon(DesignR.drawable.ic_replay) },
                    trailing = {
                        if (state.rerunning) ActivityIndicator(size = ActivityIndicatorSize.Small)
                    }
                ) {
                    Text(
                        stringResource(R.string.ci_rerun),
                        style = LpmTheme.typography.body,
                        color = colors.tint
                    )
                }
            }
            checks.githubUrl?.let { url ->
                ButtonRow(
                    text = stringResource(R.string.ci_open_github),
                    onClick = { uri.openUri(url) },
                    icon = painterResource(DesignR.drawable.ic_open_in_new)
                )
            }
        }
    }
}

@Composable
private fun CheckRow(check: CiCheck, onOpen: () -> Unit) {
    val colors = LpmTheme.colors
    ListRow(
        onClick = if (check.url.isEmpty()) null else onOpen,
        leading = { CiStateIcon(check.state) },
        trailing = {
            Text(
                text = check.detail,
                style = LpmTheme.typography.caption1,
                color = colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    ) {
        Text(
            text = check.name,
            style = LpmTheme.typography.body,
            color = colors.label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false)
        )
        Spacer(Modifier.width(8.dp))
    }
}

@Composable
private fun RowIcon(drawable: Int) {
    Icon(
        painterResource(drawable),
        contentDescription = null,
        tint = LpmTheme.colors.tint,
        modifier = Modifier.size(22.dp)
    )
}
