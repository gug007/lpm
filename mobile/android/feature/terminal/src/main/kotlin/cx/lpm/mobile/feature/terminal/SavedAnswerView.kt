package cx.lpm.mobile.feature.terminal

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.mac.LastAnswer
import cx.lpm.mobile.core.designsystem.component.MarkdownText
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * The answer an agent tab last ended a turn on, in place of its terminal while the Mac
 * is away, clear of the banner that says when it's from.
 */
@Composable
internal fun SavedAnswerView(
    answer: LastAnswer,
    background: Color,
    modifier: Modifier = Modifier,
    topInset: Dp = 0.dp
) {
    Column(
        modifier
            .fillMaxSize()
            .background(background)
            // A touch here isn't one for the terminal underneath.
            .pointerInput(Unit) { detectTapGestures {} }
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = topInset + 14.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(
            text = stringResource(R.string.terminal_last_answer),
            style = LpmTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold),
            color = LpmTheme.colors.secondaryLabel
        )
        MarkdownText(answer.text)
    }
}
