package cx.lpm.mobile.feature.projects.services

import android.content.ClipData
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ButtonRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.LogSeverity
import cx.lpm.mobile.feature.projects.R
import cx.lpm.mobile.feature.projects.ci.CiFixRows
import cx.lpm.mobile.feature.projects.detail.TerminalRowSkeleton
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Under a crashed service's log (iOS `ServiceCrashPanel`): the CI sheet's Fix with …
 * rows, each opening a new tab whose agent is told how the service crashed, and Copy
 * log.
 */
@Composable
internal fun ServiceCrashPanel(
    state: ServiceLogsUiState,
    onFix: (LaunchpadOption) -> Unit,
    modifier: Modifier = Modifier
) {
    val clipboard = LocalClipboard.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(COPIED_MS)
            copied = false
        }
    }
    ListSection(
        modifier = modifier,
        footer = if (state.canFix) stringResource(R.string.logs_fix_footer) else null
    ) {
        if (state.canFix) {
            val tabs = state.fixTabs
            if (tabs == null) {
                TerminalRowSkeleton()
            } else {
                CiFixRows(tabs, onFix, detail = R.string.logs_fix_description)
            }
        }
        if (state.text.isNotEmpty()) {
            ButtonRow(
                text = stringResource(if (copied) R.string.logs_copied else R.string.logs_copy),
                icon = painterResource(
                    if (copied) DesignR.drawable.ic_check else DesignR.drawable.ic_content_copy
                ),
                onClick = {
                    scope.launch {
                        clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("log", state.text)))
                    }
                    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                    copied = true
                }
            )
        }
    }
}

/** A service's log with the lines reporting an error, and the stack under each, in [red]. */
internal fun tintedLog(text: String, red: Color): AnnotatedString {
    val lines = LogSeverity.lines(text)
    val errors = LogSeverity.errorBlocks(lines).flatten().toSet()
    if (errors.isEmpty()) return AnnotatedString(text)
    return buildAnnotatedString {
        lines.forEachIndexed { i, line ->
            if (i in errors) withStyle(SpanStyle(color = red)) { append(line) } else append(line)
            if (i < lines.lastIndex) append('\n')
        }
    }
}

private const val COPIED_MS = 1_500L
