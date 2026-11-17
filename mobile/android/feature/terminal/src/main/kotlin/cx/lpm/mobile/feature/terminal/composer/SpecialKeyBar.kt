package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.terminal.R
import kotlinx.coroutines.delay

private val KeyShape = RoundedCornerShape(8.dp)

// A held arrow repeats, as on iOS: a pause, then steady steps until it's let go.
private const val REPEAT_DELAY_MS = 400L
private const val REPEAT_INTERVAL_MS = 80L

private val Arrows = listOf(
    Triple(DesignR.drawable.ic_keyboard_arrow_up, R.string.key_up, TerminalKeys.UP),
    Triple(DesignR.drawable.ic_keyboard_arrow_down, R.string.key_down, TerminalKeys.DOWN),
    Triple(DesignR.drawable.ic_chevron_left, R.string.key_left, TerminalKeys.LEFT),
    Triple(DesignR.drawable.ic_chevron_right, R.string.key_right, TerminalKeys.RIGHT)
)

/** The raw sequences the bar's keys send. */
internal object TerminalKeys {
    const val ESCAPE = "\u001b"
    const val TAB = "\t"
    const val SHIFT_TAB = "\u001b[Z"
    const val CTRL_C = "\u0003"
    const val RETURN = "\r"
    const val UP = "\u001b[A"
    const val DOWN = "\u001b[B"
    const val LEFT = "\u001b[D"
    const val RIGHT = "\u001b[C"
}

/**
 * A horizontally scrolling row of the keys the soft keyboard can't produce. Each
 * key sends its sequence to the terminal at once — independent of the message
 * field — so Ctrl-C, Esc and the arrows work without composing a message. While
 * the keyboard is open, a key pinned at the end closes it.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SpecialKeyBar(
    onKey: (String) -> Unit,
    onHideKeyboard: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.swipeDownDismissesKeyboard(onDismiss = onHideKeyboard),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            KeyCap(stringResource(R.string.key_esc), stringResource(R.string.key_esc_spoken)) {
                onKey(TerminalKeys.ESCAPE)
            }
            KeyCap(stringResource(R.string.key_tab), stringResource(R.string.key_tab_spoken)) {
                onKey(TerminalKeys.TAB)
            }
            KeyCap(
                stringResource(R.string.key_shift_tab),
                stringResource(R.string.key_shift_tab_spoken)
            ) {
                onKey(TerminalKeys.SHIFT_TAB)
            }
            KeyCap(
                stringResource(R.string.key_ctrl_c),
                stringResource(R.string.key_ctrl_c_spoken)
            ) {
                onKey(TerminalKeys.CTRL_C)
            }
            // The platform font has no ⏎ that matches iOS's; the cap draws the symbol.
            KeyCap(
                label = null,
                spoken = stringResource(R.string.key_return_spoken),
                icon = DesignR.drawable.ic_keyboard_return
            ) {
                onKey(TerminalKeys.RETURN)
            }
            ComposerDivider(vertical = true, alpha = 1f)
            Arrows.forEach { (icon, label, sequence) ->
                ArrowKey(icon, stringResource(label), repeats = true, onClick = { onKey(sequence) })
            }
        }
        if (WindowInsets.isImeVisible) {
            ComposerDivider(vertical = true, alpha = 1f)
            ArrowKey(
                DesignR.drawable.ic_keyboard_hide,
                stringResource(R.string.key_hide_keyboard),
                modifier = Modifier.padding(horizontal = 12.dp),
                onClick = onHideKeyboard
            )
        }
    }
}

@Composable
private fun KeyCap(label: String?, spoken: String, icon: Int? = null, onClick: () -> Unit) {
    val colors = LpmTheme.colors
    Box(
        modifier = Modifier
            .clip(KeyShape)
            .background(colors.tertiarySystemFill)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = spoken }
            .defaultMinSize(minWidth = 52.dp, minHeight = 29.dp)
            .padding(horizontal = 9.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center
    ) {
        if (icon != null) {
            Icon(
                painterResource(icon),
                contentDescription = null,
                tint = colors.label,
                modifier = Modifier.size(17.dp)
            )
        } else if (label != null) {
            Text(
                text = label,
                modifier = Modifier.clearAndSetSemantics {},
                style = LpmTheme.typography.footnote.copy(
                    fontWeight = FontWeight.Medium,
                    lineHeight = 15.sp,
                    letterSpacing = 0.sp
                ),
                color = colors.label,
                textAlign = TextAlign.Center,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun ArrowKey(
    icon: Int,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    repeats: Boolean = false
) {
    val interactions = remember { MutableInteractionSource() }
    val pressed by interactions.collectIsPressedAsState()
    val latest by rememberUpdatedState(onClick)
    var repeated by remember { mutableStateOf(false) }
    LaunchedEffect(repeats && pressed) {
        if (!(repeats && pressed)) {
            repeated = false
            return@LaunchedEffect
        }
        delay(REPEAT_DELAY_MS)
        while (true) {
            repeated = true
            latest()
            delay(REPEAT_INTERVAL_MS)
        }
    }
    Box(
        modifier = modifier
            .size(38.dp, 32.dp)
            .clip(KeyShape)
            .background(LpmTheme.colors.tertiarySystemFill)
            .clickable(interactions, LocalIndication.current, role = Role.Button) {
                if (!repeated) latest()
                repeated = false
            },
        contentAlignment = Alignment.Center
    ) {
        Icon(
            painterResource(icon),
            contentDescription = label,
            tint = LpmTheme.colors.label,
            modifier = Modifier.size(22.dp)
        )
    }
}
