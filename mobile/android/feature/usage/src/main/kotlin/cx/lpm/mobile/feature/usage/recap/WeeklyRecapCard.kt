package cx.lpm.mobile.feature.usage.recap

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

private val CardShape = RoundedCornerShape(14.dp)
private val TileShape = RoundedCornerShape(10.dp)
private val RowStyle = recapText(14, 18.sp, RecapColors.soft)
private val TileLabel = recapText(13, 16.sp, RecapColors.muted)
private val TileValue = recapText(24, 28.sp, RecapColors.strong, FontWeight.ExtraBold)
    .copy(fontFeatureSettings = "tnum")

private fun bigNumber(size: Int) = recapText(
    size,
    size.sp,
    RecapColors.strong,
    FontWeight.ExtraBold
).copy(letterSpacing = (-0.02).em)

/**
 * "My agents' week" in design units, 600 wide: the card the desktop shares, with nothing
 * on it that names a project. Shown scaled to fit ([ScaledRecapCard]) and shared as an
 * image of the same layout, unframed: the card's rectangle without the rounded border,
 * as the desktop draws its image.
 */
@Composable
internal fun WeeklyRecapCard(
    view: RecapView,
    modifier: Modifier = Modifier,
    framed: Boolean = true
) {
    Column(
        modifier
            .width(RECAP_WIDTH.dp)
            .then(
                if (framed) {
                    Modifier
                        .clip(CardShape)
                        .background(RecapGlow)
                        .border(1.dp, RecapColors.border, CardShape)
                } else {
                    Modifier.background(RecapGlow)
                }
            )
            .padding(start = 28.dp, top = 26.dp, end = 28.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Header(view.title, view.range)
        Hero(view)
        Tiles(view)
        if (view.mix.isNotEmpty()) AgentsLine(view.mix)
        Footer()
    }
}

@Composable
private fun Header(title: String, range: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            title,
            Modifier.weight(1f),
            style = recapText(17, 22.sp, RecapColors.text, FontWeight.Bold),
            maxLines = 1
        )
        Text(range, style = recapText(15, 22.sp, RecapColors.muted), maxLines = 1)
    }
}

/**
 * The tokens lead and the hours follow, each over its label; without tokens, the hours
 * and what they mean share a line when they fit.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Hero(view: RecapView) {
    val tokens = view.tokens
    if (tokens != null) {
        Stacked(tokens, RECAP_TOKENS_LABEL, 64)
        Stacked(view.hours, RECAP_HOURS_LABEL, 52)
        return
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(view.hours, Modifier.alignByBaseline(), style = bigNumber(64), maxLines = 1)
        Text(
            RECAP_HOURS_LABEL,
            Modifier.alignByBaseline(),
            style = TextStyle(fontSize = 15.sp, color = RecapColors.soft),
            maxLines = 1
        )
    }
}

/** A big number of [size] over its label. */
@Composable
private fun Stacked(value: String, label: String, size: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(value, style = bigNumber(size), maxLines = 1)
        Text(label, style = recapText(15, 18.sp, RecapColors.soft), maxLines = 1)
    }
}

@Composable
private fun Tiles(view: RecapView) {
    Row(
        Modifier.height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        view.tiles.forEach { tile ->
            Tile(Modifier.weight(1f)) {
                Text(tile.value, style = TileValue, maxLines = 1)
                Text(tile.label, style = TileLabel, maxLines = 1)
            }
        }
        Tile(Modifier.weight(1f)) {
            Text(
                view.lines.added,
                style = TileValue.copy(fontSize = 20.sp, color = RecapColors.green),
                maxLines = 1
            )
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = RecapColors.red)) { append(view.lines.removed) }
                    append(" lines")
                },
                style = TileLabel,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun Tile(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier
            .fillMaxHeight()
            .background(RecapColors.tile, TileShape)
            .border(1.dp, RecapColors.border, TileShape)
            .padding(horizontal = 14.dp, vertical = 12.dp)
    ) { content() }
}

/** The agents' shares on one line: "Claude 64%, Codex 36%", or "All Claude". */
@Composable
private fun AgentsLine(mix: List<MixSlice>) {
    Text(mixText(mix), style = RowStyle, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/** lpm's mark and address, on the right. */
@Composable
private fun Footer() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(36.dp),
        contentAlignment = Alignment.CenterEnd
    ) { RecapMark() }
}
