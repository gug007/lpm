package cx.lpm.mobile.feature.share

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.ListLeadingSlot
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** What came in: its picture or kind, its title and where it's from. */
@Composable
internal fun SharedItemsRow(items: SharedItems, loading: Boolean, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    ListRow(modifier = modifier, verticalPadding = 14.dp) {
        Box(
            Modifier
                .size(52.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(colors.tertiarySystemFill),
            contentAlignment = Alignment.Center
        ) {
            val thumbnail = items.thumbnail
            if (thumbnail != null) {
                Image(
                    bitmap = thumbnail,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Icon(
                    painter = painterResource(
                        if (items.links.isEmpty()) {
                            DesignR.drawable.ic_format_align_left
                        } else {
                            DesignR.drawable.ic_link
                        }
                    ),
                    contentDescription = null,
                    tint = colors.secondaryLabel,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            if (loading) {
                ActivityIndicator(size = ActivityIndicatorSize.Small)
            } else {
                val count = items.images.size
                val images = pluralStringResource(R.plurals.share_images, count, count)
                Text(
                    text = items.headline ?: images,
                    style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                val detail = listOfNotNull(
                    items.detailLink,
                    images.takeIf { items.detailCountsImages }
                ).joinToString(" · ")
                if (detail.isNotEmpty()) {
                    Text(
                        text = detail,
                        style = LpmTheme.typography.caption1,
                        color = colors.secondaryLabel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

/** A place the share can go, with a check beside the chosen one. */
@Composable
internal fun DestinationRow(
    title: String,
    detail: String,
    icon: Painter,
    chosen: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    ListRow(
        modifier = modifier.semantics { selected = chosen },
        onClick = onClick,
        leading = {
            Icon(
                painter = icon,
                contentDescription = null,
                tint = colors.secondaryLabel,
                modifier = Modifier.size(22.dp)
            )
        },
        leadingSlot = DestinationSlot,
        trailing = {
            if (chosen) {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_check),
                    contentDescription = null,
                    tint = colors.tint,
                    modifier = Modifier.size(22.dp)
                )
            }
        }
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(text = title, style = LpmTheme.typography.body, color = colors.label)
            Text(text = detail, style = LpmTheme.typography.caption1, color = colors.secondaryLabel)
        }
    }
}

private val DestinationSlot = ListLeadingSlot(width = 24.dp, spacing = 12.dp)
