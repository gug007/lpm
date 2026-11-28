package cx.lpm.mobile.feature.projects.talk

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.TalkPlan
import cx.lpm.mobile.core.ui.providerMeta
import cx.lpm.mobile.core.ui.tint
import cx.lpm.mobile.feature.projects.R

/** What the plan's rows and buttons do. */
@Immutable
internal class TalkPlanActions(
    val setProject: (String) -> Unit = {},
    val setAgent: (String) -> Unit = {},
    val setPrompt: (String) -> Unit = {},
    val approve: () -> Unit = {}
)

/**
 * The plan the Mac made of the sentence, a step a row (iOS `TalkPlanView`): which
 * project, which agent and what it's told, each open to a change before Approve sends
 * it back.
 */
@Composable
internal fun TalkPlanView(
    plan: TalkPlan,
    state: TalkUiState,
    actions: TalkPlanActions,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val type = LpmTheme.typography
    val running = state.talk.running
    var editing by rememberSaveable { mutableStateOf(false) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                text = stringResource(R.string.talk_plan_title),
                style = type.title3.copy(fontWeight = FontWeight.Bold),
                color = colors.label,
                modifier = Modifier
                    .weight(1f)
                    .alignByBaseline()
            )
            Text(
                text = plan.stepCount,
                style = type.subheadline,
                color = colors.secondaryLabel,
                modifier = Modifier.alignByBaseline()
            )
        }
        Column {
            TalkPlanRow(
                icon = painterResource(DesignR.drawable.ic_library_add),
                iconSize = 19.dp,
                title = plan.placeTitle,
                change = {
                    ChangeMenu(
                        choices = state.projects,
                        picked = plan.project,
                        enabled = !running,
                        onPick = actions.setProject
                    )
                }
            ) {
                if (plan.project.isEmpty()) {
                    Text(
                        text = stringResource(R.string.talk_which_project),
                        style = TalkPlanValueStyle,
                        color = colors.orange
                    )
                } else {
                    Text(
                        state.projectTitle(plan.project),
                        style = TalkPlanValueStyle,
                        color = colors.label
                    )
                }
            }
            TalkPlanRow(
                icon = painterResource(DesignR.drawable.ic_auto_awesome_fill),
                iconSize = 18.dp,
                title = stringResource(R.string.talk_start),
                tint = providerMeta(plan.agent).tint,
                change = {
                    ChangeMenu(
                        choices = state.agents,
                        picked = plan.agent,
                        enabled = !running && state.agents.isNotEmpty(),
                        onPick = actions.setAgent
                    )
                }
            ) {
                Text(
                    text = plan.startLine(state.agentLabel(plan.agent)),
                    style = TalkPlanValueStyle,
                    color = colors.label
                )
            }
            TalkPlanRow(
                icon = painterResource(DesignR.drawable.ic_send),
                iconSize = 22.dp,
                title = stringResource(R.string.talk_send),
                connects = false,
                change = {
                    TalkPlanRowLabel(
                        title = stringResource(
                            if (editing) R.string.talk_done else R.string.talk_edit
                        ),
                        onClick = { editing = !editing },
                        enabled = !running
                    )
                }
            ) {
                if (editing) {
                    PromptField(plan.prompt, actions.setPrompt, enabled = !running)
                } else {
                    Text(plan.prompt, style = TalkPlanValueStyle, color = colors.label)
                }
            }
        }
        Column(
            Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            state.talk.runError?.let {
                Text(it, style = type.footnote, color = colors.red, textAlign = TextAlign.Center)
            }
            Text(
                text = stringResource(R.string.talk_nothing_runs),
                style = type.footnote,
                color = colors.secondaryLabel,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            TalkSheetButton(
                text = stringResource(R.string.talk_approve),
                onClick = actions.approve,
                prominent = true,
                enabled = plan.canRun && !running
            )
            TalkSheetButton(text = stringResource(R.string.cancel), onClick = onClose)
        }
    }
}

/** "Change" over a menu of [choices], the one in the plan checked. */
@Composable
private fun ChangeMenu(
    choices: List<TalkChoice>,
    picked: String,
    enabled: Boolean,
    onPick: (String) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    Box {
        TalkPlanRowLabel(
            title = stringResource(R.string.talk_change),
            onClick = { open = true },
            enabled = enabled
        )
        ContextMenu(expanded = open, onDismissRequest = { open = false }) {
            choices.forEach { choice ->
                ContextMenuItem(
                    title = choice.title,
                    onClick = { onPick(choice.id) },
                    icon = if (choice.id == picked) {
                        painterResource(DesignR.drawable.ic_check)
                    } else {
                        null
                    },
                    iconDescription = stringResource(R.string.auto_pull_selected)
                )
            }
        }
    }
}

/** The prompt being edited, focused with the cursor after what the plan had. */
@Composable
private fun PromptField(value: String, onValueChange: (String) -> Unit, enabled: Boolean) {
    val colors = LpmTheme.colors
    val style = TalkPlanValueStyle.copy(color = colors.label)
    val focus = remember { FocusRequester() }
    LaunchedEffect(focus) { focus.requestFocus() }
    var field by remember { mutableStateOf(TextFieldValue(value, TextRange(value.length))) }
    val shown = if (field.text == value) field else TextFieldValue(value, TextRange(value.length))
    BasicTextField(
        value = shown,
        onValueChange = {
            field = it
            if (it.text != value) onValueChange(it.text)
        },
        modifier = Modifier
            .fillMaxWidth()
            .focusRequester(focus),
        enabled = enabled,
        textStyle = style,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        minLines = 2,
        maxLines = 8,
        cursorBrush = SolidColor(colors.tint),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) {
                    Text(
                        text = stringResource(R.string.talk_prompt),
                        style = style.copy(color = colors.placeholderText)
                    )
                }
                inner()
            }
        }
    )
}
