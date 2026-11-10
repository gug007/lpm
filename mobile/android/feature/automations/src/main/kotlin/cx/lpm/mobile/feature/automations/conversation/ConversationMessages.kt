package cx.lpm.mobile.feature.automations.conversation

import android.content.ClipData
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.MarkdownText
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AutomationAsk
import cx.lpm.mobile.core.model.AutomationLivePart
import cx.lpm.mobile.core.model.automationLiveParts
import cx.lpm.mobile.core.model.automationStepsLabel
import cx.lpm.mobile.feature.automations.R
import cx.lpm.mobile.feature.automations.ui.color
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * One turn: the question as a bubble on the right, how the run went, then its answer
 * with copy (and read aloud, through [readAloud], [speakingBlock] the block being
 * spoken). A reply that simply finished keeps its status line quietly under the answer.
 */
@Composable
fun AutomationMessage(
    message: MessageUi,
    modifier: Modifier = Modifier,
    speakingBlock: Int? = null,
    readAloud: @Composable () -> Unit = {},
    askCard: @Composable (AutomationAsk) -> Unit = {}
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (message.question.isNotEmpty()) QuestionBubble(message.question)
        if (!message.quiet) MessageMeta(message)
        if (message.output.isNotEmpty()) {
            MarkdownText(message.output, speakingBlock = speakingBlock)
            Row {
                CopyButton(message.output)
                readAloud()
            }
        }
        message.asks.forEach { askCard(it) }
        if (message.quiet) MessageMeta(message)
    }
}

/** What was asked, on the right like a sent message. */
@Composable
fun QuestionBubble(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .padding(start = 48.dp),
        horizontalArrangement = Arrangement.End
    ) {
        SelectionContainer {
            Text(
                text = text,
                style = LpmTheme.typography.body,
                modifier = Modifier
                    .background(
                        LpmTheme.colors.secondarySystemGroupedBackground,
                        RoundedCornerShape(18.dp)
                    )
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            )
        }
    }
}

@Composable
private fun MessageMeta(message: MessageUi) {
    val style = LpmTheme.typography.caption1
    val color = LpmTheme.colors.secondaryLabel
    Row(
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        StatusDot(color = message.tone.color(), size = 7.dp)
        Text(message.label, style = style, color = color)
        message.ranOn?.let { Text(it, style = style, color = color) }
        message.duration?.let { Text(it, style = style, color = color) }
        message.cost?.let { Text(it, style = style, color = color) }
        if (message.condensed) {
            Text(stringResource(R.string.chat_condensed), style = style, color = color)
        }
        Spacer(Modifier.weight(1f))
        Text(message.clock, style = style, color = color, maxLines = 1)
    }
}

/**
 * Copies the message as written — markdown source, so links and structure survive a
 * paste. The checkmark is the only confirmation, so it holds long enough to be read.
 */
@Composable
private fun CopyButton(text: String) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (!copied) return@LaunchedEffect
        delay(COPIED_MS)
        copied = false
    }
    Box(
        Modifier
            .size(width = 30.dp, height = 28.dp)
            .clickableNoIndication(onClick = {
                val clip = ClipEntry(ClipData.newPlainText(null, text))
                scope.launch { clipboard.setClipEntry(clip) }
                copied = true
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
            }),
        contentAlignment = Alignment.CenterStart
    ) {
        Icon(
            painter = painterResource(
                if (copied) DesignR.drawable.ic_check else DesignR.drawable.ic_content_copy
            ),
            contentDescription = stringResource(
                if (copied) R.string.chat_copied else R.string.chat_copy
            ),
            tint = if (copied) LpmTheme.colors.tint else LpmTheme.colors.secondaryLabel,
            modifier = Modifier.size(18.dp)
        )
    }
}

/** A reply on its way: the bubble, then the wait or the answer as it streams in. */
@Composable
fun PendingMessage(message: String, live: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        QuestionBubble(message)
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ActivityIndicator(size = ActivityIndicatorSize.Small)
            Text(
                text = stringResource(
                    if (live.isEmpty()) R.string.chat_waiting_reply else R.string.chat_replying
                ),
                style = LpmTheme.typography.caption1,
                color = LpmTheme.colors.secondaryLabel
            )
        }
        if (live.isNotEmpty()) LiveMessage(live)
    }
}

/**
 * What a running agent has said so far, read like its finished messages: its words in
 * full, and each burst of tool calls folded onto one line.
 */
@Composable
fun LiveMessage(text: String, modifier: Modifier = Modifier) {
    val parts = remember(text) { automationLiveParts(text) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        parts.forEach { part ->
            when (part) {
                is AutomationLivePart.Said -> MarkdownText(part.text)

                is AutomationLivePart.Steps -> Text(
                    text = "→ " + automationStepsLabel(part.names) +
                        if (part.names.size > 1) " · ${part.names.size} steps" else "",
                    style = LpmTheme.typography.caption1.copy(fontFamily = FontFamily.Monospace),
                    color = LpmTheme.colors.secondaryLabel,
                    modifier = Modifier
                        .border(1.dp, LpmTheme.colors.separator, RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                )
            }
        }
    }
}

private const val COPIED_MS = 1_500L
