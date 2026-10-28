package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.ClaudeAccountChoice
import cx.lpm.mobile.core.model.DuplicateOptions
import cx.lpm.mobile.core.model.RunMode
import cx.lpm.mobile.core.model.WorkState
import cx.lpm.mobile.core.model.WorkStatusInput
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

class WireProjectsTest {
    @Test
    fun lifecycle() {
        assertFrame("""{ "t": "projects" }""", Wire.projects())
        assertFrame("""{ "t": "sidebar" }""", Wire.sidebar())
        assertFrame("""{ "t": "start", "name": "api", "profile": "" }""", Wire.start("api"))
        assertFrame(
            """{ "t": "start", "name": "api", "profile": "full" }""",
            Wire.start("api", profile = "full")
        )
        assertFrame("""{ "t": "stop", "name": "api" }""", Wire.stop("api"))
        assertFrame(
            """{ "t": "toggleService", "name": "api", "service": "web" }""",
            Wire.toggleService("api", "web")
        )
        assertFrame(
            """{ "t": "restartService", "name": "api", "service": "web" }""",
            Wire.restartService("api", "web")
        )
        assertFrame(
            """{ "t": "stopService", "name": "api", "service": "web" }""",
            Wire.stopService("api", "web")
        )
        assertFrame("""{ "t": "status", "project": "api" }""", Wire.status("api"))
        assertFrame(
            """{ "t": "clearStatus", "project": "api", "paneId": "api-1", "value": "Done" }""",
            Wire.clearStatus("api", "api-1", "Done")
        )
        assertFrame(
            """{ "t": "archiveStatus", "project": "api", "keys": ["codex_api-1", "omp_api-1"] }""",
            Wire.archiveStatus("api", listOf("codex_api-1", "omp_api-1"))
        )
        assertFrame(
            """{ "t": "markStatusSeen", "project": "api", "keys": ["codex_api-1"] }""",
            Wire.markStatusSeen("api", listOf("codex_api-1"))
        )
        assertFrame(
            """{ "t": "markStatusUnread", "project": "api", "keys": ["codex_api-1", "omp_api-1"] }""",
            Wire.markStatusUnread("api", listOf("codex_api-1", "omp_api-1"))
        )
        assertFrame("""{ "t": "remove", "name": "api-2" }""", Wire.remove("api-2"))
        assertFrame(
            """{ "t": "renameProject", "project": "api", "name": "" }""",
            Wire.renameProject("api", "")
        )
    }

    @Test
    fun duplicateWithDefaults() {
        assertFrame(
            """{ "t": "duplicate", "name": "api", "count": 1, "labels": [""], "excludeUncommitted": false,
                 "reinstallDeps": false, "pullLatest": true, "groupName": "", "runMode": "none" }""",
            Wire.duplicate("api", DuplicateOptions())
        )
        assertFrame("""{ "t": "duplicateDefaults" }""", Wire.duplicateDefaults())
    }

    @Test
    fun duplicateRunningAnActionTrimsAndCapsLabels() {
        val options = DuplicateOptions(
            count = 2,
            labels = listOf(" fix A ", "fix B\n", "extra"),
            groupName = " Sprint ",
            excludeUncommitted = true,
            runMode = RunMode.Action,
            actionName = " claude ",
            command = "ignored",
            prompt = "  Fix the login bug "
        )
        assertFrame(
            """{ "t": "duplicate", "name": "api", "count": 2, "labels": ["fix A", "fix B"], "excludeUncommitted": true,
                 "reinstallDeps": false, "pullLatest": true, "groupName": "Sprint", "runMode": "action",
                 "action": " claude ", "prompt": "Fix the login bug" }""",
            Wire.duplicate("api", options)
        )
    }

    @Test
    fun duplicateRunningACommandDropsABlankPrompt() {
        val options =
            DuplicateOptions(runMode = RunMode.Command, command = " npm test ", prompt = "  ")
        assertFrame(
            """{ "t": "duplicate", "name": "api", "count": 1, "labels": [""], "excludeUncommitted": false,
                 "reinstallDeps": false, "pullLatest": true, "groupName": "", "runMode": "command", "command": "npm test" }""",
            Wire.duplicate("api", options)
        )
        val noRun =
            DuplicateOptions(
                runMode = RunMode.None,
                prompt = "ignored",
                count = 3,
                labels = listOf("a")
            )
        assertFrame(
            """{ "t": "duplicate", "name": "api", "count": 3, "labels": ["a"], "excludeUncommitted": false,
                 "reinstallDeps": false, "pullLatest": true, "groupName": "", "runMode": "none" }""",
            Wire.duplicate("api", noRun)
        )
    }

    @Test
    fun setWorkStatusSendsNullToClear() {
        assertFrame(
            """{ "t": "setWorkStatus", "project": "api", "status": null }""",
            Wire.setWorkStatus("api", null)
        )
        assertFrame(
            """{ "t": "setWorkStatus", "project": "api", "status": { "state": "blocked", "label": "x", "note": "API down" } }""",
            Wire.setWorkStatus(
                "api",
                WorkStatusInput(WorkState.Blocked, label = "x", note = " API down ")
            )
        )
        assertFrame(
            """{ "t": "setWorkStatus", "project": "api", "status": { "state": "custom", "label": "Review", "emoji": "👀" } }""",
            Wire.setWorkStatus(
                "api",
                WorkStatusInput(WorkState.Custom, label = "Review", emoji = "👀", note = "")
            )
        )
    }

    @Test
    fun setAutoPullSendsNullToFollow() {
        assertFrame(
            """{ "t": "setAutoPull", "project": "api", "value": null }""",
            Wire.setAutoPull("api", null)
        )
        assertFrame(
            """{ "t": "setAutoPull", "project": "api", "value": false }""",
            Wire.setAutoPull("api", false)
        )
    }

    @Test
    fun claudeAccountChoices() {
        assertFrame("""{ "t": "claudeAccounts" }""", Wire.claudeAccounts())
        assertFrame(
            """{ "t": "setClaudeAccount", "project": "api", "choice": { "kind": "parent" } }""",
            Wire.setClaudeAccount("api", ClaudeAccountChoice.Parent, confirm = emptyList())
        )
        assertFrame(
            """{ "t": "setClaudeAccount", "project": "api", "choice": { "kind": "pin", "id": "" } }""",
            Wire.setClaudeAccount("api", ClaudeAccountChoice.Pin(""), confirm = emptyList())
        )
        assertFrame(
            """{ "t": "setClaudeAccount", "project": "api", "choice": { "kind": "list", "ids": ["work", "side"] },
                 "confirm": ["side"] }""",
            Wire.setClaudeAccount(
                "api",
                ClaudeAccountChoice.AccountList(listOf("work", "side")),
                confirm = listOf("side")
            )
        )
        assertFrame(
            """{ "t": "setClaudeAccount", "project": "api", "choice": { "kind": "main" } }""",
            Wire.setClaudeAccount("api", ClaudeAccountChoice.Main, confirm = emptyList())
        )
    }

    @Test
    fun sidebarFolders() {
        assertFrame(
            """{ "t": "sidebarCreateFolder", "name": "Client Work" }""",
            Wire.sidebarCreateFolder("Client Work")
        )
        assertFrame(
            """{ "t": "sidebarRenameFolder", "name": "Client Work", "newName": "Clients" }""",
            Wire.sidebarRenameFolder("Client Work", "Clients")
        )
        assertFrame(
            """{ "t": "sidebarDeleteFolder", "name": "Clients" }""",
            Wire.sidebarDeleteFolder("Clients")
        )
        assertFrame(
            """{ "t": "sidebarMoveProject", "project": "blog", "folder": "Clients" }""",
            Wire.sidebarMoveProject("blog", "Clients")
        )
        assertFrame(
            """{ "t": "sidebarMoveProject", "project": "blog" }""",
            Wire.sidebarMoveProject("blog", null)
        )
        assertFrame(
            """{ "t": "sidebarMoveProject", "project": "blog" }""",
            Wire.sidebarMoveProject("blog", "")
        )
    }

    @Test
    fun newProjects() {
        assertFrame("""{ "t": "listDirs", "path": "~" }""", Wire.listDirs("~"))
        assertFrame("""{ "t": "listSshHosts" }""", Wire.listSshHosts())
        assertFrame(
            """{ "t": "createProject", "name": "blog", "root": "~/code/blog" }""",
            Wire.createProject("blog", "~/code/blog")
        )
        val ssh = buildJsonObject {
            put("host", "box")
            put("user", "me")
            put("port", 22)
            put("key", "~/.ssh/id_ed25519")
            put("dir", "/srv/app")
        }
        assertFrame(
            """{ "t": "createSshProject", "name": "app", "ssh": { "host": "box", "user": "me", "port": 22,
                 "key": "~/.ssh/id_ed25519", "dir": "/srv/app" } }""",
            Wire.createSshProject("app", ssh)
        )
        assertFrame(
            """{ "t": "cloneProject", "name": "site", "url": "git@github.com:o/site.git", "branch": "", "destParent": "/Users/me/code" }""",
            Wire.cloneProject("site", "git@github.com:o/site.git", "", "/Users/me/code")
        )
    }
}
