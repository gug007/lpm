package cx.lpm.mobile.feature.terminal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** What stands in the composer's place: [content] under a hairline. */
@Composable
internal fun TerminalBottomBar(
    background: Color,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Column(modifier.fillMaxWidth().background(background)) {
        Box(Modifier.fillMaxWidth().height(0.5.dp).background(Color.White.copy(alpha = 0.12f)))
        Box(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) { content() }
    }
}
