package cx.lpm.mobile.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LpmCommandsTest {
    @Test
    fun namesFollowTheMacsRule() {
        assertTrue(isValidCommandName("fix-ticket"))
        assertTrue(isValidCommandName("a_1"))
        assertFalse(isValidCommandName(""))
        assertFalse(isValidCommandName("-fix"))
        assertFalse(isValidCommandName("fix ticket"))
        assertFalse(isValidCommandName("a".repeat(65)))
    }

    @Test
    fun aWholeMessageRunsACommand() {
        assertEquals(
            CommandRun("fix-ticket", "LPM-12 now"),
            parseCommandRun(" /fix-ticket  LPM-12 now ")
        )
        assertEquals(CommandRun("explain", ""), parseCommandRun("/explain"))
        assertNull(parseCommandRun("please /explain"))
        assertNull(parseCommandRun("/"))
    }

    @Test
    fun variablesSplitIntoAsksAndAuto() {
        assertEquals(
            PromptVariables(listOf("ticket", "who"), listOf("branch")),
            promptVariables("Fix {{ticket}} on {{ branch }} for {{who}}, {{ticket}} again")
        )
        assertTrue(promptVariables("No variables, just \$ARGUMENTS").isEmpty)
    }

    @Test
    fun listsWithoutAProjectOfferOnlyGlobal() {
        assertEquals(listOf(CommandScope.Global), LpmCommandLists().scopes)
        assertEquals(
            listOf(CommandScope.Project, CommandScope.Global),
            LpmCommandLists(project = LpmCommandList()).scopes
        )
    }
}
