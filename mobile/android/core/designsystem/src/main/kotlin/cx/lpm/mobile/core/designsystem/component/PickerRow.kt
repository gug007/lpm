package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** One group of a [PickerRow]'s options, under its [title] when it has one. */
@Immutable
data class PickerSection<T>(val title: String?, val options: List<T>)

/**
 * A menu-style `Picker` row: the title, then the selected option in gray with the
 * up-down chevrons. Tapping it opens a [ContextMenu] over the value with a check
 * beside the current option; [optionIcon] maps an option to its drawable.
 */
@Composable
fun <T> PickerRow(
    title: String,
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    optionLabel: (T) -> String,
    modifier: Modifier = Modifier,
    optionIcon: ((T) -> Int)? = null
) {
    PickerRow(
        title = title,
        sections = listOf(PickerSection(null, options)),
        selected = selected,
        onSelect = onSelect,
        optionLabel = optionLabel,
        modifier = modifier,
        optionIcon = optionIcon
    )
}

/** A [PickerRow] whose menu groups its options in [sections] (`Section("…")` in a `Picker`). */
@JvmName("SectionedPickerRow")
@Composable
fun <T> PickerRow(
    title: String,
    sections: List<PickerSection<T>>,
    selected: T,
    onSelect: (T) -> Unit,
    optionLabel: (T) -> String,
    modifier: Modifier = Modifier,
    optionIcon: ((T) -> Int)? = null
) {
    var open by remember { mutableStateOf(false) }
    val colors = LpmTheme.colors
    ListRow(
        modifier = modifier,
        onClick = { open = true },
        trailing = {
            Box {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (optionIcon != null) {
                        Glyph(
                            painter = painterResource(optionIcon(selected)),
                            contentDescription = null,
                            size = 24.dp,
                            bounds = DpSize(14.dp, 22.dp),
                            tint = colors.secondaryLabel
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(
                        text = optionLabel(selected),
                        style = LpmTheme.typography.body,
                        color = colors.secondaryLabel,
                        maxLines = 1
                    )
                    Spacer(Modifier.width(6.dp))
                    Glyph(
                        painter = painterResource(R.drawable.ic_unfold_more),
                        contentDescription = null,
                        size = 18.dp,
                        bounds = DpSize(7.dp, 13.dp),
                        tint = colors.secondaryLabel
                    )
                }
                ContextMenu(expanded = open, onDismissRequest = { open = false }) {
                    sections.forEachIndexed { index, section ->
                        if (index > 0) ContextMenuDivider()
                        section.title?.let { ContextMenuSectionHeader(it) }
                        section.options.forEach { option ->
                            ContextMenuItem(
                                title = optionLabel(option),
                                onClick = { onSelect(option) },
                                icon = if (option ==
                                    selected
                                ) {
                                    painterResource(R.drawable.ic_check)
                                } else {
                                    null
                                },
                                trailingIcon = optionIcon?.let { painterResource(it(option)) }
                            )
                        }
                    }
                }
            }
        }
    ) {
        Text(
            text = title,
            style = LpmTheme.typography.body,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}
