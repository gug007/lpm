package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * One section of an inset-grouped list: an optional [header] (with a trailing
 * [headerAction]), the rows in a [ListCard], and an optional [footer] (or other
 * [footerContent] in its place). Sections
 * stack with no extra spacing; each leaves the room iOS leaves below it.
 */
@Composable
fun ListSection(
    modifier: Modifier = Modifier,
    header: String? = null,
    headerStyle: ListHeaderStyle = ListHeaderStyle.Caps,
    headerAction: (@Composable () -> Unit)? = null,
    headerContent: (@Composable () -> Unit)? = null,
    footer: String? = null,
    footerColor: Color = LpmTheme.colors.secondaryLabel,
    footerContent: (@Composable () -> Unit)? = null,
    spacing: ListSectionSpacing = ListSectionSpacing.Regular,
    content: @Composable () -> Unit
) {
    Column(modifier.padding(horizontal = ListDefaults.Margin)) {
        if (headerContent != null) {
            Box(
                Modifier.padding(
                    start = ListDefaults.RowPadding,
                    end = ListDefaults.RowPadding,
                    top = 2.dp,
                    bottom = 8.8.dp
                )
            ) { headerContent() }
        } else if (header != null) {
            ListSectionHeader(text = header, style = headerStyle, action = headerAction)
        } else {
            Spacer(Modifier.height(7.6.dp))
        }
        ListCard(content = content)
        if (footer != null) {
            ListSectionFooter(footer, color = footerColor)
        } else if (footerContent != null) {
            Box(Modifier.padding(ListSectionFooterPadding)) { footerContent() }
        } else {
            Spacer(Modifier.height(if (spacing == ListSectionSpacing.Compact) 16.5.dp else 25.6.dp))
        }
    }
}
