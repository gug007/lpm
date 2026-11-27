package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.ButtonRow
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.designsystem.component.PlainIconButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommitHookFailure
import cx.lpm.mobile.feature.git.R

/** What the hook panel's buttons do. */
class CommitHookActions(
    val retry: () -> Unit = {},
    val skipHooks: () -> Unit = {},
    val dismiss: () -> Unit = {}
)

/**
 * Why the commit didn't happen when a git hook stopped it, with the ways on (iOS
 * `CommitHookSection`, the desktop's CommitHookPanel): [fixRows] hands what it printed
 * to an agent, Try Again, or Commit Without Hooks once confirmed.
 */
@Composable
internal fun ColumnScope.CommitHookSection(
    failure: CommitHookFailure,
    busy: Boolean,
    actions: CommitHookActions,
    fixRows: @Composable () -> Unit
) {
    var confirmSkip by rememberSaveable { mutableStateOf(false) }
    ListSection {
        HookHeader(failure, onDismiss = actions.dismiss)
        HookOutput(failure)
        if (failure.changed.isNotEmpty()) {
            ListRow {
                Text(
                    text = if (failure.changed.size == 1) {
                        stringResource(R.string.git_hook_changed_one, failure.changed[0])
                    } else {
                        stringResource(R.string.git_hook_changed_many, failure.changed.size)
                    },
                    style = LpmTheme.typography.footnote,
                    color = LpmTheme.colors.secondaryLabel
                )
            }
        }
    }
    ListSection {
        fixRows()
        ButtonRow(
            text = if (failure.changed.isEmpty()) {
                stringResource(R.string.git_hook_retry)
            } else {
                pluralStringResource(
                    R.plurals.git_hook_retry_changed,
                    failure.changed.size,
                    failure.changed.size
                )
            },
            onClick = actions.retry,
            enabled = !busy
        )
        ButtonRow(
            text = stringResource(R.string.git_hook_skip),
            onClick = { confirmSkip = true },
            enabled = !busy,
            destructive = true
        )
    }
    if (confirmSkip) {
        LpmConfirmationDialog(
            title = stringResource(R.string.git_hook_skip_title),
            message = stringResource(R.string.git_hook_skip_message, failure.hook),
            buttons = listOf(
                AlertButton(
                    stringResource(R.string.git_hook_skip),
                    AlertRole.Destructive,
                    onClick = actions.skipHooks
                ),
                AlertButton(stringResource(R.string.cancel), AlertRole.Cancel)
            ),
            onDismissRequest = { confirmSkip = false }
        )
    }
}

/** The red octagon, "The pre-commit hook stopped this commit" over its summary, and ×. */
@Composable
private fun HookHeader(failure: CommitHookFailure, onDismiss: () -> Unit) {
    val colors = LpmTheme.colors
    ListRow {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(
                painter = painterResource(DesignR.drawable.ic_report_fill),
                contentDescription = null,
                tint = colors.red,
                modifier = Modifier.size(20.dp)
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = stringResource(R.string.git_hook_title, failure.hook),
                    style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                    color = colors.label
                )
                failure.summary?.let {
                    Text(
                        text = it,
                        style = LpmTheme.typography.footnote,
                        color = colors.secondaryLabel
                    )
                }
            }
            PlainIconButton(
                icon = painterResource(DesignR.drawable.ic_close),
                contentDescription = stringResource(R.string.git_secrets_back),
                onClick = onDismiss,
                tint = colors.secondaryLabel,
                iconSize = 14.dp,
                frame = 20.dp
            )
        }
    }
}

/**
 * What the hook printed, in monospace: the lines that report something, or all of it
 * with "Show All N Lines".
 */
@Composable
private fun HookOutput(failure: CommitHookFailure) {
    var showAll by rememberSaveable { mutableStateOf(false) }
    val text = if (showAll) failure.output else failure.preview.joinToString("\n")
    val colors = LpmTheme.colors
    ListRow {
        Column(
            Modifier
                .weight(1f)
                .padding(vertical = 2.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            SelectionContainer(
                Modifier
                    .fillMaxWidth()
                    .then(
                        if (showAll) {
                            Modifier
                                .heightIn(max = 320.dp)
                                .verticalScroll(rememberScrollState())
                        } else {
                            Modifier
                        }
                    )
                    .horizontalScroll(rememberScrollState())
            ) {
                Text(
                    text = text,
                    style = LpmTheme.typography.caption1.copy(fontFamily = FontFamily.Monospace),
                    color = colors.label,
                    softWrap = false
                )
            }
            if (failure.lineCount > failure.preview.size) {
                Text(
                    text = if (showAll) {
                        stringResource(R.string.git_hook_show_less)
                    } else {
                        stringResource(R.string.git_hook_show_all, failure.lineCount)
                    },
                    style = LpmTheme.typography.footnote,
                    color = colors.tint,
                    modifier = Modifier.clickable(role = Role.Button) { showAll = !showAll }
                )
            }
        }
    }
}
