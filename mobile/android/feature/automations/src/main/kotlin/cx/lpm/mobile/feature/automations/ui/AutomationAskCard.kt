package cx.lpm.mobile.feature.automations.ui

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AutomationAsk
import cx.lpm.mobile.core.model.AutomationAskDraft
import cx.lpm.mobile.core.model.AutomationAskQuestion
import cx.lpm.mobile.core.model.automationAskAnswers
import cx.lpm.mobile.core.model.automationAskDeadlineNote
import cx.lpm.mobile.core.model.automationAskDisplay
import cx.lpm.mobile.core.model.automationAskToggle
import cx.lpm.mobile.feature.automations.R
import cx.lpm.mobile.feature.automations.format.automationAskParts
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * A question an automation put to the user (iOS `AutomationAskCard`): the answers
 * stacked like an action sheet while it is open, then what became of it. [framed]
 * draws its own card, for the conversation; in a list the row is the frame.
 */
@Composable
fun AutomationAskCard(
    ask: AutomationAsk,
    /** Open: what happens if nobody answers in time. Settled: when it settled. */
    whenText: String,
    busy: Boolean,
    error: String?,
    onAnswer: (JsonObject) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    framed: Boolean = true
) {
    val colors = LpmTheme.colors
    val shape = RoundedCornerShape(16.dp)
    val frame = if (framed) {
        Modifier
            .border(1.dp, colors.secondaryLabel.copy(alpha = 0.25f), shape)
            .padding(14.dp)
    } else {
        Modifier.padding(vertical = 4.dp)
    }
    // The sheet's rows stand out from what's behind them: the conversation's
    // grouped background, or a list row's own fill.
    val fill = if (framed) {
        colors.secondarySystemGroupedBackground
    } else {
        colors.tertiarySystemGroupedBackground
    }
    Box(modifier.fillMaxWidth().then(frame)) {
        if (ask.isOpen) {
            AskForm(ask, whenText, busy, error, fill, onAnswer, onDismiss)
        } else {
            AskClosed(ask, whenText)
        }
    }
}

/** Open: what happens if nobody answers in time. Settled: when it settled. */
fun automationAskWhen(ask: AutomationAsk, nowSecs: Long, clock: (Long) -> String): String =
    if (ask.isOpen) {
        automationAskDeadlineNote(ask, nowSecs)
    } else {
        clock(ask.answeredAt ?: ask.askedAt)
    }

@Composable
private fun AskForm(
    ask: AutomationAsk,
    deadline: String,
    busy: Boolean,
    error: String?,
    fill: Color,
    onAnswer: (JsonObject) -> Unit,
    onDismiss: () -> Unit
) {
    var drafts by remember(ask.id) { mutableStateOf(mapOf<String, AutomationAskDraft>()) }
    val (answers, missing) = automationAskAnswers(ask.questions, drafts)
    val lead = ask.questions.size == 1
    val optional = stringResource(R.string.ask_optional)
    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        ask.questions.forEach { q ->
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    val (headline, details) = automationAskParts(q.text)
                    Text(
                        text = buildAnnotatedString {
                            append(headline)
                            if (q.optional) {
                                withStyle(
                                    SpanStyle(
                                        color = LpmTheme.colors.secondaryLabel,
                                        fontSize = LpmTheme.typography.caption1.fontSize,
                                        fontWeight = FontWeight.Normal
                                    )
                                ) { append("  $optional") }
                            }
                        },
                        style = if (lead) {
                            LpmTheme.typography.headline
                        } else {
                            LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold)
                        }
                    )
                    if (details.isNotEmpty()) {
                        Text(
                            text = details,
                            style = LpmTheme.typography.subheadline,
                            color = LpmTheme.colors.secondaryLabel,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                    val default = q.defaultAnswer
                    if (!lead && default != null) {
                        Text(
                            text = stringResource(
                                R.string.ask_default,
                                automationAskDisplay(q, default)
                            ),
                            style = LpmTheme.typography.caption1,
                            color = LpmTheme.colors.secondaryLabel
                        )
                    }
                }
                AskField(
                    q,
                    draft = drafts[q.id] ?: AutomationAskDraft(),
                    onChange = { drafts = drafts + (q.id to it) },
                    onAnswer = if (ask.answersOnTap) {
                        { onAnswer(JsonObject(mapOf(q.id to it))) }
                    } else {
                        null
                    },
                    busy = busy,
                    fill = fill
                )
            }
        }
        if (!ask.answersOnTap) {
            Sheet(fill) {
                SheetRow(
                    text = stringResource(if (lead) R.string.ask_send else R.string.ask_send_all),
                    bold = true,
                    enabled = missing == null,
                    busy = busy
                ) { onAnswer(answers) }
            }
        }
        if (!error.isNullOrEmpty()) {
            Text(
                text = error,
                style = LpmTheme.typography.caption1,
                color = LpmTheme.colors.red,
                modifier = Modifier.fillMaxWidth()
            )
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            if (deadline.isNotEmpty()) {
                Text(
                    text = deadline,
                    style = LpmTheme.typography.caption1,
                    color = LpmTheme.colors.secondaryLabel,
                    textAlign = TextAlign.Center
                )
            }
            LinkButton(
                text = stringResource(R.string.ask_skip),
                onClick = onDismiss,
                enabled = !busy,
                color = LpmTheme.colors.secondaryLabel
            )
        }
    }
}

@Composable
private fun AskField(
    q: AutomationAskQuestion,
    draft: AutomationAskDraft,
    onChange: (AutomationAskDraft) -> Unit,
    /** Set when a tap on yes, no or an option is the whole answer. */
    onAnswer: ((JsonElement) -> Unit)?,
    busy: Boolean,
    fill: Color
) {
    when (q.type) {
        "confirm" -> if (onAnswer != null) {
            Sheet(fill) {
                SheetRow(q.yesLabel, bold = true, busy = busy) { onAnswer(JsonPrimitive(true)) }
                SheetDivider()
                SheetRow(q.noLabel, busy = busy) { onAnswer(JsonPrimitive(false)) }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for ((value, label) in listOf("yes" to q.yesLabel, "no" to q.noLabel)) {
                    val picked = draft.picks.firstOrNull() == value
                    Sheet(fill, Modifier.weight(1f)) {
                        SheetRow(label, picked = picked, busy = busy) {
                            onChange(draft.copy(picks = if (picked) emptyList() else listOf(value)))
                        }
                    }
                }
            }
        }

        "choice" -> Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Sheet(fill) {
                q.options.forEachIndexed { i, option ->
                    if (i > 0) SheetDivider()
                    SheetRow(
                        option.label,
                        detail = option.description,
                        picked = option.label in draft.picks,
                        busy = busy,
                        role = when {
                            onAnswer != null -> Role.Button
                            q.multiple -> Role.Checkbox
                            else -> Role.RadioButton
                        }
                    ) {
                        if (onAnswer != null) {
                            onAnswer(JsonArray(listOf(JsonPrimitive(option.label))))
                        } else {
                            onChange(automationAskToggle(q, draft, option.label))
                        }
                    }
                }
            }
            if (q.other) OtherField(q, draft, onChange, onAnswer, busy, fill)
        }

        else -> AnswerBox(
            value = draft.text,
            placeholder = q.placeholder.ifEmpty { stringResource(R.string.ask_your_answer) },
            onValueChange = { onChange(draft.copy(text = it)) },
            fill = fill,
            minLines = if (q.multiline) 3 else 1,
            maxLines = if (q.multiline) 8 else 4
        )
    }
}

@Composable
private fun OtherField(
    q: AutomationAskQuestion,
    draft: AutomationAskDraft,
    onChange: (AutomationAskDraft) -> Unit,
    onAnswer: ((JsonElement) -> Unit)?,
    busy: Boolean,
    fill: Color
) {
    val own = draft.other.trim()
    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AnswerBox(
            value = draft.other,
            placeholder = stringResource(R.string.ask_other),
            onValueChange = { value ->
                val picks = if (!q.multiple && value.isNotEmpty()) emptyList() else draft.picks
                onChange(draft.copy(other = value, picks = picks))
            },
            fill = fill,
            modifier = Modifier.weight(1f)
        )
        if (onAnswer != null) {
            Sheet(fill, Modifier.width(84.dp)) {
                SheetRow(
                    stringResource(R.string.ask_send_short),
                    bold = true,
                    enabled = own.isNotEmpty(),
                    busy = busy
                ) { onAnswer(JsonArray(listOf(JsonPrimitive(own)))) }
            }
        }
    }
}

@Composable
private fun AskClosed(ask: AutomationAsk, whenText: String) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StatusDot(color = LpmTheme.colors.secondaryLabel, size = 7.dp)
            Text(
                text = ask.statusLabel,
                style = LpmTheme.typography.caption1.copy(fontWeight = FontWeight.SemiBold),
                color = LpmTheme.colors.secondaryLabel,
                modifier = Modifier.weight(1f)
            )
            Text(
                whenText,
                style = LpmTheme.typography.caption1,
                color = LpmTheme.colors.secondaryLabel
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ask.questions.forEach { q ->
                val answer = automationAskDisplay(q, ask.answers[q.id])
                Text(
                    text = buildAnnotatedString {
                        withStyle(SpanStyle(color = LpmTheme.colors.secondaryLabel)) {
                            append(q.text)
                        }
                        if (answer.isNotEmpty()) {
                            append(" → ")
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                                append(answer)
                            }
                        }
                    },
                    style = LpmTheme.typography.subheadline
                )
            }
        }
    }
}
