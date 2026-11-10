package cx.lpm.mobile.core.model

import org.junit.Assert.assertEquals
import org.junit.Test

class AutomationLiveTest {
    @Test
    fun foldsARunOfStepsSoWhatTheAgentSaidStaysInView() {
        val live = (
            listOf(
                "Found one new chat: customer #482 asks for a refund. My draft:",
                "Hi! Sorry for the slow reply. We've refunded the second payment.",
                "→ Skill",
                "→ Read"
            ) + List(14) { "→ Bash" }
            ).joinToString("\n")
        assertEquals(
            listOf(
                "Found one new chat: customer #482 asks for a refund. My draft:",
                "Hi! Sorry for the slow reply. We've refunded the second payment.",
                "→ Skill, Read, Bash ×14"
            ).joinToString("\n"),
            automationLiveTail(live)
        )
    }

    @Test
    fun splitsWhatTheAgentSaidFromTheStepsItTook() {
        assertEquals(
            listOf(
                AutomationLivePart.Said("Looking at the chats."),
                AutomationLivePart.Steps(listOf("Bash", "Read")),
                AutomationLivePart.Said("Found one.\nIt asks for a refund.")
            ),
            automationLiveParts(
                "Looking at the chats.\n→ Bash\n→ Read\nFound one.\nIt asks for a refund."
            )
        )
        assertEquals(
            listOf(AutomationLivePart.Said("→  Bash")),
            automationLiveParts("→  Bash")
        )
        assertEquals(
            "Skill, Bash ×3, Read",
            automationStepsLabel(listOf("Skill", "Bash", "Read", "Bash", "Bash"))
        )
    }
}
