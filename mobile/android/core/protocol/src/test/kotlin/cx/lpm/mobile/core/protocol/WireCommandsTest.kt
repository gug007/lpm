package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.CommandRef
import cx.lpm.mobile.core.model.CommandScope
import org.junit.Test

class WireCommandsTest {
    @Test
    fun listsAndExpand() {
        assertFrame(
            """{ "t": "lpmCommands", "project": "api", "reqId": "c1" }""",
            Wire.lpmCommands("api", "c1")
        )
        assertFrame(
            """{ "t": "lpmCommandExpand", "project": "api", "reqId": "c2", "name": "fix-ticket", "args": "LPM-12" }""",
            Wire.lpmCommandExpand("api", "c2", "fix-ticket", "LPM-12")
        )
    }

    @Test
    fun saveCarriesTheCommandAndWhatItWas() {
        assertFrame(
            """{ "t": "lpmCommandSave", "project": "api", "reqId": "c3",
                 "command": { "scope": "project", "folder": null, "name": "ship", "description": "", "body": "Ship it" },
                 "previous": null }""",
            Wire.lpmCommandSave(
                "api",
                "c3",
                CommandRef(CommandScope.Project, null, "ship"),
                description = "",
                body = "Ship it",
                previous = null
            )
        )
        assertFrame(
            """{ "t": "lpmCommandSave", "project": "api", "reqId": "c4",
                 "command": { "scope": "global", "folder": "Git", "name": "ship", "description": "Ships", "body": "Ship it" },
                 "previous": { "scope": "project", "folder": null, "name": "ship" } }""",
            Wire.lpmCommandSave(
                "api",
                "c4",
                CommandRef(CommandScope.Global, "Git", "ship"),
                description = "Ships",
                body = "Ship it",
                previous = CommandRef(CommandScope.Project, null, "ship")
            )
        )
    }

    @Test
    fun deleteAndFolders() {
        assertFrame(
            """{ "t": "lpmCommandDelete", "project": "api", "reqId": "c5",
                 "target": { "scope": "global", "folder": "Git", "name": "ship" } }""",
            Wire.lpmCommandDelete("api", "c5", CommandRef(CommandScope.Global, "Git", "ship"))
        )
        assertFrame(
            """{ "t": "lpmCommandFolder", "project": "", "reqId": "c6", "op": "create", "scope": "global", "name": "Git" }""",
            Wire.lpmCommandFolder("", "c6", CommandFolderOp.Create, CommandScope.Global, "Git")
        )
        assertFrame(
            """{ "t": "lpmCommandFolder", "project": "api", "reqId": "c7", "op": "rename", "scope": "project",
                 "name": "Git", "newName": "Release" }""",
            Wire.lpmCommandFolder(
                "api",
                "c7",
                CommandFolderOp.Rename,
                CommandScope.Project,
                "Git",
                newName = "Release"
            )
        )
        assertFrame(
            """{ "t": "lpmCommandFolder", "project": "api", "reqId": "c8", "op": "delete", "scope": "project", "name": "Git" }""",
            Wire.lpmCommandFolder("api", "c8", CommandFolderOp.Delete, CommandScope.Project, "Git")
        )
    }
}
