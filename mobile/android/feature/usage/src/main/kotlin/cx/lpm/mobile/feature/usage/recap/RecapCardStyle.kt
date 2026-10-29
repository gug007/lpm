package cx.lpm.mobile.feature.usage.recap

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

// The desktop card's default (light) theme and layout (`recapCardTheme.ts`), in design
// units: the card is 600 wide and drawn at whatever density fits it, sp equal to dp.

internal object RecapColors {
    val glow = Color(0xFFE6F2E8)
    val ground = Color(0xFFFAFAF7)
    val border = Color(0xFFE2E2DC)
    val text = Color(0xFF1F1F1F)
    val strong = Color(0xFF111111)
    val soft = Color(0xFF4A4A4A)
    val muted = Color(0xFF5F5F5F)
    val tile = Color(0xFFFFFFFF)
    val green = Color(0xFF15803D)
    val red = Color(0xFFB91C1C)
    val markGround = Color(0xFFF0F0EC)
    val markBorder = Color(0xFFDEDED8)
    val markDot = Color(0xFF16A34A)
    val markRing = Color(0xFF7A7A7A)
}

internal const val RECAP_WIDTH = 600
internal const val RECAP_TITLE = "My agents' week"
internal const val RECAP_MONTH_TITLE = "My agents' month"
internal const val RECAP_HOURS_LABEL = "of agents working for me"
internal const val RECAP_TOKENS_LABEL = "tokens read and written by my agents"

// The share image is the card at twice its size, as the desktop's.
internal const val RECAP_IMAGE_SCALE = 2f

/** A line box of [line] (CSS `line-height`), the text centered in it as CSS does. */
internal fun recapText(
    size: Int,
    line: TextUnit,
    color: Color,
    weight: FontWeight = FontWeight.Normal
): TextStyle = TextStyle(
    fontFamily = FontFamily.Default,
    fontSize = size.sp,
    fontWeight = weight,
    lineHeight = line,
    color = color,
    lineHeightStyle = LineHeightStyle(
        alignment = LineHeightStyle.Alignment.Center,
        trim = LineHeightStyle.Trim.None
    )
)

/** The body's own line height: the desktop's 1.5. */
internal fun bodyLine(size: Int): TextUnit = (size * 1.5).sp

/**
 * CSS `linear-gradient(<angle>deg, …)`: the gradient line runs through the center at
 * [degrees] clockwise from straight up, long enough to reach the far corners.
 */
internal class CssLinearGradient(
    private val degrees: Double,
    private val colors: List<Color>,
    private val stops: List<Float>
) : ShaderBrush() {
    override fun createShader(size: Size): Shader {
        val radians = Math.toRadians(degrees)
        val direction = Offset(sin(radians).toFloat(), -cos(radians).toFloat())
        val half = (abs(size.width * direction.x) + abs(size.height * direction.y)) / 2
        val center = Offset(size.width / 2, size.height / 2)
        return LinearGradientShader(
            from = center - direction * half,
            to = center + direction * half,
            colors = colors,
            colorStops = stops
        )
    }

    override fun equals(other: Any?): Boolean = other is CssLinearGradient &&
        other.degrees == degrees &&
        other.colors == colors &&
        other.stops == stops

    override fun hashCode(): Int =
        (degrees.hashCode() * 31 + colors.hashCode()) * 31 + stops.hashCode()
}

internal val RecapGlow = CssLinearGradient(
    degrees = 150.0,
    colors = listOf(RecapColors.glow, RecapColors.ground),
    stops = listOf(0f, 0.55f)
)
