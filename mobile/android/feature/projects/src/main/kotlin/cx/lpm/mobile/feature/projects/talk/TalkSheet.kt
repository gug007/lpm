package cx.lpm.mobile.feature.projects.talk

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import cx.lpm.mobile.core.data.talk.TalkPhase
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ModalSheet
import cx.lpm.mobile.core.designsystem.component.ModalSheetState
import cx.lpm.mobile.core.designsystem.component.TouchTarget
import cx.lpm.mobile.core.designsystem.component.clickableTarget
import cx.lpm.mobile.core.designsystem.component.rememberModalSheetState
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.core.ui.dictation.FieldDictation
import cx.lpm.mobile.feature.projects.R

/** What the sheet's field and buttons do. */
@Immutable
internal class TalkSheetActions(
    val setText: (String) -> Unit = {},
    val makePlan: () -> Unit = {},
    val tryAgain: () -> Unit = {},
    val close: () -> Unit = {},
    val abandonDictation: () -> Unit = {},
    val plan: TalkPlanActions = TalkPlanActions()
)

/**
 * The Talk button's sheet (iOS `TalkSheet`): ask, wait for the plan, then approve it or
 * read why there isn't one. It stands as tall as what it shows.
 */
@Composable
internal fun TalkSheet(
    state: TalkUiState,
    dictation: FieldDictation,
    actions: TalkSheetActions,
    sheet: ModalSheetState = rememberModalSheetState()
) {
    ModalSheet(
        onDismissRequest = actions.close,
        fullHeight = false,
        state = sheet,
        contentInsets = WindowInsets.navigationBars.union(WindowInsets.ime),
        plain = true,
        floating = true
    ) {
        TalkSheetContent(
            state = state,
            dictation = dictation,
            actions = actions,
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 30.dp, bottom = 12.dp)
        )
    }
}

@Composable
internal fun TalkSheetContent(
    state: TalkUiState,
    dictation: FieldDictation,
    actions: TalkSheetActions,
    modifier: Modifier = Modifier
) {
    val talk = state.talk
    Box(modifier) {
        when (val phase = talk.phase) {
            TalkPhase.Ask -> TalkAskView(
                talk = talk,
                dictation = dictation,
                onTextChange = actions.setText,
                onMakePlan = actions.makePlan,
                onClose = actions.close,
                onAbandonDictation = actions.abandonDictation
            )

            TalkPhase.Planning -> Waiting(talk.text.trimmingWhitespace(), actions.close)

            TalkPhase.Plan -> talk.plan?.let {
                TalkPlanView(it, state, actions.plan, onClose = actions.close)
            }

            is TalkPhase.Failed -> Failed(
                title = stringResource(
                    if (phase.unsupported) {
                        R.string.talk_unsupported_title
                    } else {
                        R.string.talk_failed_title
                    }
                ),
                message = phase.message,
                onTryAgain = actions.tryAgain,
                onClose = actions.close
            )
        }
    }
}

@Composable
private fun Waiting(sentence: String, onClose: () -> Unit) {
    val colors = LpmTheme.colors
    val type = LpmTheme.typography
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Text(
            text = sentence,
            style = type.body,
            color = colors.label,
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.secondarySystemBackground, RoundedCornerShape(12.dp))
                .padding(14.dp)
        )
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ActivityIndicator()
            Text(
                text = stringResource(R.string.talk_planning),
                style = type.body,
                color = colors.secondaryLabel
            )
        }
        TalkSheetButton(text = stringResource(R.string.cancel), onClick = onClose)
    }
}

@Composable
private fun Failed(title: String, message: String, onTryAgain: () -> Unit, onClose: () -> Unit) {
    val colors = LpmTheme.colors
    val type = LpmTheme.typography
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                title,
                style = type.title3.copy(fontWeight = FontWeight.Bold),
                color = colors.label
            )
            Text(message, style = type.callout, color = colors.secondaryLabel)
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            TalkSheetButton(
                text = stringResource(R.string.talk_try_again),
                onClick = onTryAgain,
                prominent = true
            )
            TalkSheetButton(text = stringResource(R.string.cancel), onClick = onClose)
        }
    }
}

/** One of the sheet's full-width buttons: the step forward, or the way out under it. */
@Composable
internal fun TalkSheetButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    prominent: Boolean = false,
    enabled: Boolean = true
) {
    val colors = LpmTheme.colors
    val target = remember { TouchTarget() }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val ground = when {
        !prominent -> Modifier
        enabled -> Modifier.background(colors.tint, CircleShape)
        else -> Modifier.background(colors.tertiarySystemFill, CircleShape)
    }
    Box(
        modifier
            // The way out's touch area reaches up into the step forward, which keeps its own.
            .zIndex(if (prominent) 1f else 0f)
            .clickableTarget(target, interaction, enabled, Role.Button, onClick)
            .fillMaxWidth()
            .alpha(
                when {
                    !pressed -> 1f
                    prominent -> PROMINENT_PRESSED_ALPHA
                    else -> PLAIN_PRESSED_ALPHA
                }
            )
            .then(ground)
            .padding(vertical = if (prominent) 6.dp else 0.dp)
            .heightIn(min = 34.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = LpmTheme.typography.body,
            color = when {
                !enabled -> colors.tertiaryLabel
                prominent -> Color.White
                else -> colors.tint
            },
            // The label is an accessibility node of its own, apart from the button's state.
            modifier = if (enabled) Modifier else Modifier.semantics { disabled() }
        )
    }
}

private const val PROMINENT_PRESSED_ALPHA = 0.75f
private const val PLAIN_PRESSED_ALPHA = 0.3f
