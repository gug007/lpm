package cx.lpm.mobile.feature.projects.talk

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.dictation.plusDictated
import cx.lpm.mobile.core.data.talk.TalkState
import cx.lpm.mobile.core.designsystem.component.PlainTextField
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.dictation.DictationCancelButton
import cx.lpm.mobile.core.ui.dictation.DictationMicDisc
import cx.lpm.mobile.core.ui.dictation.DictationPreview
import cx.lpm.mobile.core.ui.dictation.DictationStopButton
import cx.lpm.mobile.core.ui.dictation.DictationStrip
import cx.lpm.mobile.core.ui.dictation.FieldDictation
import cx.lpm.mobile.feature.projects.R

/**
 * The sheet's first state (iOS `TalkAskView`): one sentence, typed or dictated. A take
 * that ends with words sends them by itself; typed text waits for Make a plan.
 */
@Composable
internal fun TalkAskView(
    talk: TalkState,
    dictation: FieldDictation,
    onTextChange: (String) -> Unit,
    onMakePlan: () -> Unit,
    onClose: () -> Unit,
    onAbandonDictation: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val type = LpmTheme.typography
    val focus = LocalFocusManager.current
    val heard = dictation.heard
    val fieldHidden = dictation.stripShown && (!talk.hasText || heard.isNotEmpty())
    val abandon by rememberUpdatedState(onAbandonDictation)
    DisposableEffect(Unit) { onDispose { abandon() } }
    val startDictation = {
        focus.clearFocus()
        dictation.start()
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Text(
            text = stringResource(R.string.talk_ask_title),
            style = type.title3.copy(fontWeight = FontWeight.Bold),
            color = colors.label
        )
        Column(
            Modifier
                .fillMaxWidth()
                .background(colors.secondarySystemBackground, RoundedCornerShape(12.dp))
                .padding(start = 14.dp, end = 8.dp, top = 14.dp, bottom = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            PlainTextField(
                value = talk.text,
                onValueChange = onTextChange,
                placeholder = stringResource(R.string.talk_ask_placeholder),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences
                ),
                minLines = 3,
                maxLines = 8,
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (fieldHidden) Modifier.alpha(0f).height(0.dp) else Modifier)
            )
            if (heard.isNotEmpty()) {
                DictationPreview(
                    text = talk.text.plusDictated(heard),
                    style = type.body.copy(color = colors.label),
                    maxHeight = 132.dp,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (dictation.stripShown) {
                    DictationCancelButton(
                        active = dictation.active,
                        color = colors.secondaryLabel,
                        onClick = dictation.cancel
                    )
                    DictationStrip(
                        state = dictation.state,
                        owner = dictation.owner,
                        meter = dictation.meter,
                        ink = colors.label,
                        onRetry = startDictation,
                        modifier = Modifier
                            .weight(1f)
                            .height(22.dp)
                    )
                } else {
                    Spacer(Modifier.weight(1f))
                }
                if (dictation.active) {
                    DictationStopButton(
                        transcribing = dictation.state.isTranscribing,
                        glyph = Color.White,
                        onStop = dictation.stop
                    )
                } else {
                    DictationMicDisc(
                        ground = colors.label,
                        glyph = colors.systemBackground,
                        onClick = startDictation,
                        disc = 30.dp
                    )
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            TalkSheetButton(
                text = stringResource(R.string.talk_make_plan),
                onClick = {
                    focus.clearFocus()
                    onMakePlan()
                },
                prominent = true,
                enabled = talk.hasText && !dictation.active
            )
            TalkSheetButton(text = stringResource(R.string.cancel), onClick = onClose)
        }
    }
}
