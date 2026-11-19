package cx.lpm.mobile.feature.projects.ci

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CheckLog
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.feature.projects.R

/** What the CI sheet's log rows ask the Mac for. */
internal class CheckLogs(val load: (url: String) -> Unit = {})

/**
 * A failed check in the CI sheet, opened to say why (iOS `CheckLogRow`): the step that
 * failed and the last lines it printed, read on the Mac, with the whole log a tap away.
 */
@Composable
internal fun CheckLogRow(check: CiCheck, log: CheckLog?, error: String?, onLoad: () -> Unit) {
    val colors = LpmTheme.colors
    val uri = LocalUriHandler.current
    val load by rememberUpdatedState(onLoad)
    LaunchedEffect(check.url) { if (log == null) load() }
    ListRow(indent = 28.dp) {
        Column(
            Modifier.padding(vertical = 2.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            when {
                log != null -> {
                    Text(
                        text = stringResource(R.string.ci_log_failed, log.step),
                        style = LpmTheme.typography.caption1,
                        color = colors.secondaryLabel
                    )
                    val label = stringResource(R.string.ci_log_label, log.step)
                    SelectionContainer(
                        Modifier
                            .fillMaxWidth()
                            .background(colors.tertiarySystemFill, RoundedCornerShape(10.dp))
                            .horizontalScroll(rememberScrollState())
                            .semantics { contentDescription = label }
                    ) {
                        Text(
                            text = log.text,
                            style = LpmTheme.typography.caption2.copy(
                                fontFamily = FontFamily.Monospace
                            ),
                            color = colors.label,
                            softWrap = false,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                }

                error != null -> {
                    Text(error, style = LpmTheme.typography.caption1, color = colors.secondaryLabel)
                    Link(stringResource(R.string.ci_log_try_again), onLoad)
                }

                else -> Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ActivityIndicator(size = ActivityIndicatorSize.Small)
                    Text(
                        stringResource(R.string.ci_log_reading),
                        style = LpmTheme.typography.caption1,
                        color = colors.secondaryLabel
                    )
                }
            }
            if (check.url.isNotEmpty()) {
                Link(stringResource(R.string.ci_log_full)) { uri.openUri(check.url) }
            }
        }
    }
}

@Composable
private fun Link(text: String, onClick: () -> Unit) {
    Text(
        text = text,
        style = LpmTheme.typography.footnote,
        color = LpmTheme.colors.tint,
        modifier = Modifier.clickableNoIndication(onClick = onClick)
    )
}
