package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AutoPullMode
import cx.lpm.mobile.core.model.ClaudeAccounts
import cx.lpm.mobile.core.model.CustomWorkStatus
import cx.lpm.mobile.core.model.DirListing
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.SshHostInfo
import cx.lpm.mobile.core.model.StatusEntry
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.defaultWorkStatusPalette
import cx.lpm.mobile.core.model.int
import cx.lpm.mobile.core.model.list
import cx.lpm.mobile.core.model.objects
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.model.strings

internal val projectParsers = parsers {
    put("projects") { o ->
        Inbound.Projects(
            projects = o.list("projects", Project::parse),
            // A Mac too old to send a palette gets the shipped one.
            workStatuses = o.objects("workStatuses")?.mapNotNull(CustomWorkStatus::parse)
                ?: defaultWorkStatusPalette,
            workStatusOrder = o.strings("workStatusOrder").orEmpty(),
            autoPullMode = AutoPullMode.fromWire(o["autoPullMode"]),
            seenAgentsShown = (o.int("seenAgentsShown") ?: 3).coerceIn(1, 10),
            keepFinishedAgents = o.bool("keepFinishedAgents") ?: false
        )
    }
    put("sidebar") { o ->
        Inbound.Sidebar(
            order = o.strings("order").orEmpty(),
            groups = o.list("groups", ProjectFolder::parse)
        )
    }
    put("projects-changed") { Inbound.ProjectsChanged }
    put("status") { o ->
        Inbound.Status(
            project = o.str("project"),
            entries = o.list("status", StatusEntry::parse),
            seen = o.list("seen", StatusEntry::parse)
        )
    }
    put("status-changed") { o -> Inbound.StatusChanged(project = o.str("project")) }
    put("duplicateProgress") { o ->
        Inbound.DuplicateProgress(
            done = o.int("done") ?: 0,
            total = o.int("total") ?: 0,
            name = o.str("name")
        )
    }
    put("duplicate") { o ->
        Inbound.Duplicate(
            name = o.str("name"),
            error = o.failure("Couldn't duplicate the project."),
            warning = o.string("warning")
        )
    }
    put("duplicateDefaults") { o ->
        Inbound.DuplicateDefaults(
            excludeUncommitted = o.bool("excludeUncommitted") ?: false,
            reinstallDeps = o.bool("reinstallDeps") ?: false,
            pullLatest = o.bool("pullLatest") ?: true
        )
    }
    put("remove") { o -> Inbound.Remove(error = o.failure("Couldn't remove the project.")) }
    put("renameProject") { o ->
        Inbound.RenameProject(
            project = o.str("project"),
            error = o.failure("Couldn't rename the project.")
        )
    }
    put("setWorkStatus") { o ->
        Inbound.SetWorkStatus(
            project = o.str("project"),
            error = o.failure("Couldn't set the status.")
        )
    }
    put("setAutoPull") { o ->
        Inbound.SetAutoPull(
            project = o.str("project"),
            error = o.failure("Couldn't change auto pull.")
        )
    }
    put("claudeAccounts") { o ->
        Inbound.ClaudeAccounts(if (o.ok) ClaudeAccounts.parse(o) else null)
    }
    put("setClaudeAccount") { o ->
        Inbound.SetClaudeAccount(
            project = o.str("project"),
            error = o.failure("Couldn't change the Claude account.")
        )
    }
    for (t in listOf(
        "sidebarCreateFolder",
        "sidebarRenameFolder",
        "sidebarDeleteFolder",
        "sidebarMoveProject"
    )) {
        put(t) { o ->
            Inbound.SidebarMutation(
                order = o.strings("order").orEmpty(),
                groups = o.list("groups", ProjectFolder::parse),
                error = o.failure("Couldn't update folders.")
            )
        }
    }
    put("listDirs") { o ->
        Inbound.ListDirs(
            listing = if (o.ok) DirListing.parse(o) else null,
            error = o.failure("Couldn't list folders.")
        )
    }
    put("listSshHosts") { o ->
        Inbound.ListSshHosts(
            hosts = if (o.ok) o.list("hosts", SshHostInfo::parse) else emptyList(),
            error = o.failure("Couldn't list SSH hosts.")
        )
    }
    put("createProject") { o ->
        Inbound.CreateProject(
            name = o.str("name"),
            error = o.failure("Couldn't create the project.")
        )
    }
    put("createSshProject") { o ->
        Inbound.CreateSshProject(
            name = o.str("name"),
            error = o.failure("Couldn't create the project.")
        )
    }
    put("cloneProject") { o ->
        Inbound.CloneProject(
            name = o.str("name"),
            error = o.failure("Couldn't clone the repository.")
        )
    }
}
