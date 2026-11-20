package cx.lpm.mobile.feature.usage.stats

import cx.lpm.mobile.core.model.UsageBreakdown
import cx.lpm.mobile.core.model.UsageDailyModel
import cx.lpm.mobile.core.model.UsageTokens
import kotlin.math.roundToLong

// Per-model cost estimation, the desktop's `statsCost.ts` through iOS `StatsFormat.swift`.

/** USD per million tokens, and the multipliers fast mode and long context bill at. */
data class Rate(
    val input: Double,
    val cacheWrite: Double,
    val cacheWrite1h: Double,
    val cacheRead: Double,
    val output: Double,
    val fast: Double,
    val longContext: Double = 1.0
)

private fun anthropic(
    input: Double,
    output: Double,
    cacheRead: Double? = null,
    fast: Double = 2.0,
    longContext: Double = 1.0
) = Rate(
    input = input,
    cacheWrite = input * 1.25,
    cacheWrite1h = input * 2,
    cacheRead = cacheRead ?: (input * 0.1),
    output = output,
    fast = fast,
    longContext = longContext
)

/**
 * OpenAI bills a cache write as plain input unless the model lists a write rate, and
 * has no 1-hour tier.
 */
private fun openai(
    input: Double,
    cacheRead: Double,
    output: Double,
    cacheWrite: Double? = null,
    fast: Double = 2.0
): Rate {
    val write = cacheWrite ?: input
    return Rate(input, write, write, cacheRead, output, fast)
}

private val opusRate = anthropic(5.0, 25.0)
private val codexRate = openai(4.0, 0.4, 20.0, cacheWrite = 5.0)

/**
 * Substring tests matched in order, so a variant precedes its family —
 * `claude-opus-5-5` would otherwise be priced as Opus 5 (`RATE_TABLE` in statsCost.ts).
 */
private val rateTable: List<Pair<List<String>, Rate>> = listOf(
    listOf("fable-5-1", "mythos-5-1") to anthropic(10.0, 50.0, cacheRead = 0.25),
    listOf("mythos-preview") to anthropic(25.0, 125.0),
    listOf("fable", "mythos") to anthropic(10.0, 50.0),
    listOf("opus-5-5") to anthropic(4.0, 20.0, cacheRead = 0.2),
    listOf("opus-4-6", "opus-4-7") to anthropic(5.0, 25.0, fast = 6.0),
    listOf("opus-4-1", "opus-4-2025", "opus-4@") to anthropic(15.0, 75.0),
    listOf("opus") to opusRate,
    listOf("sonnet-5-5") to anthropic(2.0, 10.0, cacheRead = 0.1),
    listOf("sonnet-5") to anthropic(2.0, 10.0),
    listOf("sonnet") to anthropic(3.0, 15.0),
    listOf("3-5-haiku") to anthropic(0.8, 4.0),
    // A prompt over 100K tokens bills every bucket at five times the rate.
    listOf("haiku-5-5") to anthropic(0.1, 0.5, longContext = 5.0),
    listOf("haiku") to anthropic(1.0, 5.0),
    listOf("gpt-6.2-sol") to openai(2.0, 0.1, 10.0, cacheWrite = 2.5),
    listOf("gpt-6.2-astra") to openai(8.0, 0.4, 40.0, cacheWrite = 10.0),
    listOf("gpt-6.1-terra") to openai(1.0, 0.05, 5.0, cacheWrite = 1.25),
    listOf("gpt-6.1-sol") to openai(2.0, 0.1, 10.0, cacheWrite = 2.5),
    listOf("gpt-6-astra") to openai(10.0, 1.0, 50.0, cacheWrite = 12.5),
    listOf("gpt-6-sol") to openai(2.0, 0.2, 10.0, cacheWrite = 2.5),
    listOf("gpt-6-luna") to openai(0.1, 0.01, 0.5, cacheWrite = 0.125),
    listOf("gpt-5.6-terra") to openai(2.0, 0.2, 12.0, cacheWrite = 2.5),
    listOf("gpt-5.6-luna") to openai(0.2, 0.02, 1.2, cacheWrite = 0.25),
    listOf("gpt-5.6-cyber") to openai(12.5, 1.25, 75.0, cacheWrite = 15.625),
    listOf("gpt-5.6") to codexRate,
    listOf("gpt-5.5-pro") to openai(30.0, 30.0, 180.0),
    listOf("gpt-5.5") to openai(5.0, 0.5, 30.0, fast = 2.5),
    listOf("gpt-5.4-mini") to openai(0.75, 0.075, 4.5),
    listOf("gpt-5.4-nano") to openai(0.2, 0.02, 1.25),
    listOf("gpt-5.4", "codex-auto-review") to openai(2.5, 0.25, 15.0),
    listOf("gpt-5.3", "gpt-5.2") to openai(1.75, 0.175, 14.0),
    listOf("gpt-5-mini") to openai(0.25, 0.025, 2.0, fast = 1.8),
    listOf("gpt-5-nano") to openai(0.05, 0.005, 0.4),
    listOf("gpt-5.1-codex-mini", "gpt-5-codex-mini") to openai(0.25, 0.025, 2.0),
    listOf("gpt-5") to openai(1.25, 0.125, 10.0),
    listOf("codex-mini") to openai(1.5, 0.375, 6.0),
    listOf("o4-mini") to openai(1.1, 0.275, 4.4, fast = 20.0 / 11),
    listOf("o3-mini") to openai(1.1, 0.55, 4.4),
    listOf("o3") to openai(2.0, 0.5, 8.0, fast = 1.75)
)

/**
 * The first rate whose token appears (case-insensitive) in the model id, else the
 * provider's default (`pickRate` in statsCost.ts).
 */
fun pickRate(modelId: String, provider: String? = null): Rate {
    val id = modelId.lowercase()
    rateTable.firstOrNull { (tokens, _) -> tokens.any { it in id } }?.let { return it.second }
    return if (provider == "codex") codexRate else opusRate
}

/**
 * Estimated USD cost for one model's token usage. Fresh input is the input that was
 * neither a cache write nor a cache read; each bucket is priced separately, and
 * fast-mode and long-context usage are scaled by the model's multipliers for them.
 */
fun estimateModelCost(
    tokens: UsageTokens,
    modelId: String,
    provider: String? = null,
    fast: Boolean = false,
    longContext: Boolean = false
): Double {
    val rate = pickRate(modelId, provider)
    val freshInput = maxOf(
        0L,
        tokens.inputTokens - tokens.cacheCreationInputTokens - tokens.cacheReadInputTokens
    ).toDouble()
    val cacheWrite1h = minOf(tokens.cacheCreation1hInputTokens, tokens.cacheCreationInputTokens)
    val cost = freshInput * rate.input +
        (tokens.cacheCreationInputTokens - cacheWrite1h) * rate.cacheWrite +
        cacheWrite1h * rate.cacheWrite1h +
        tokens.cacheReadInputTokens * rate.cacheRead +
        tokens.outputTokens * rate.output
    return cost * (if (fast) rate.fast else 1.0) * (if (longContext) rate.longContext else 1.0) /
        1_000_000
}

/** Summed estimated cost across every per-model breakdown. */
fun estimateTotalCost(models: List<UsageBreakdown>): Double =
    models.sumOf { estimateModelCost(it.tokens, it.key, it.provider, it.fast, it.longContext) }

/** Estimated USD for one day, priced from that day's models (`estimateDailyCost`). */
fun estimateDailyCost(models: List<UsageDailyModel>): Double =
    models.sumOf { estimateModelCost(it.tokens, it.model, it.provider, it.fast, it.longContext) }

/**
 * USD for display: `$0` at or below zero, two decimals under $10, else a rounded
 * grouped integer (`formatUsd` in statsCost.ts).
 */
fun formatUsd(value: Double): String = when {
    value <= 0 -> "$0"
    value < 10 -> "$" + fixed(value, 2)
    else -> "$" + grouped(value.roundToLong())
}
