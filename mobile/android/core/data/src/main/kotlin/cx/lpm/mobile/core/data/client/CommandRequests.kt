package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.model.CommandRef
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.protocol.CommandFolderOp
import cx.lpm.mobile.core.protocol.Wire

// lpm commands. Every verb runs on a Mac worker and echoes `reqId`.

fun LpmClient.requestLpmCommands(project: String, reqId: String) =
    send(Wire.lpmCommands(project, reqId))

fun LpmClient.saveLpmCommand(
    project: String,
    reqId: String,
    command: CommandRef,
    description: String,
    body: String,
    previous: CommandRef?,
    keepOutOfGit: Boolean?
) = send(Wire.lpmCommandSave(project, reqId, command, description, body, previous, keepOutOfGit))

fun LpmClient.deleteLpmCommand(project: String, reqId: String, target: CommandRef) =
    send(Wire.lpmCommandDelete(project, reqId, target))

fun LpmClient.changeLpmCommandFolder(
    project: String,
    reqId: String,
    op: CommandFolderOp,
    scope: CommandScope,
    name: String,
    newName: String?
) = send(Wire.lpmCommandFolder(project, reqId, op, scope, name, newName))

fun LpmClient.noteCommandUsed(project: String, name: String) =
    send(Wire.lpmCommandUsed(project, name))

fun LpmClient.expandLpmCommand(
    project: String,
    reqId: String,
    name: String,
    args: String,
    cli: String
) = send(Wire.lpmCommandExpand(project, reqId, name, args, cli))

fun LpmClient.moveOtherSkill(
    project: String,
    reqId: String,
    scope: CommandScope,
    name: String,
    folder: String?,
    root: Boolean
) = send(Wire.lpmCommandOtherFolder(project, reqId, scope, name, folder, root))

fun LpmClient.convertSkill(
    project: String,
    reqId: String,
    scope: CommandScope,
    name: String,
    toLpm: Boolean
) = send(Wire.lpmCommandConvert(project, reqId, scope, name, toLpm))
