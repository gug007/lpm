// `{{key}}` input substitution into an action's shell command. Each answer is
// quoted for the spot its token sits in — bare, inside "…", or inside '…' — so
// it always stays one piece of data: `echo "hi {{name}}"` with `Ana Smith`
// runs `echo "hi "'Ana Smith'""`, and a `$(…)` answer is never expanded.
// `{{key|raw}}` splices the answer verbatim. Mirrors cmd_inputs.rs.
//
// The shell reads `…` twice: it takes the backslash off \\, \`, \$ (and \"
// inside "…"), then runs what's left as a command of its own. So the inside
// is unescaped, substituted as that command, and escaped back.

type Context = "bare" | "double" | "single" | "group";

function shellSafeValue(v: string): boolean {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(v);
}

function quoted(v: string, ctx: Context): string {
  if (shellSafeValue(v)) return v;
  const single = `'${v.replaceAll("'", "'\\''")}'`;
  switch (ctx) {
    case "double":
      return v ? `"${single}"` : "";
    case "single":
      return v.replaceAll("'", "'\\''");
    default:
      return single;
  }
}

const TOKEN_AT = /^\{\{([^}]*?)\}\}/;

function backtickBody(raw: string, inDouble: boolean): string {
  return raw.replace(inDouble ? /\\([\\`$"])/g : /\\([\\`$])/g, "$1");
}

function backtickRaw(body: string, inDouble: boolean): string {
  return body.replace(inDouble ? /[\\`$"]/g : /[\\`$]/g, "\\$&");
}

function backtickEnd(cmd: string, open: number): number {
  for (let j = open + 1; j < cmd.length; j++) {
    if (cmd[j] === "\\") j++;
    else if (cmd[j] === "`") return j;
  }
  return -1;
}

export function substituteCommand(
  cmd: string,
  values: Record<string, string>,
): string {
  let out = "";
  const stack: Context[] = [];
  let i = 0;
  while (i < cmd.length) {
    const ctx = stack.at(-1) ?? "bare";
    const token = cmd.startsWith("{{", i) ? TOKEN_AT.exec(cmd.slice(i)) : null;
    if (token) {
      const name = token[1];
      const raw = name.endsWith("|raw");
      const key = raw ? name.slice(0, -4) : name;
      if (Object.hasOwn(values, key)) {
        out += raw ? values[key] : quoted(values[key], ctx);
        i += token[0].length;
        continue;
      }
    }
    const c = cmd[i];
    const tickEnd = c === "`" && ctx !== "single" ? backtickEnd(cmd, i) : -1;
    if (tickEnd >= 0) {
      const inDouble = ctx === "double";
      const body = substituteCommand(
        backtickBody(cmd.slice(i + 1, tickEnd), inDouble),
        values,
      );
      out += "`" + backtickRaw(body, inDouble) + "`";
      i = tickEnd + 1;
      continue;
    }
    let len = 1;
    const closes =
      (ctx === "single" && c === "'") ||
      (ctx === "double" && c === '"') ||
      (ctx === "group" && c === ")");
    if (closes) {
      stack.pop();
    } else if (ctx !== "single") {
      if (c === "\\") {
        len = Math.min(2, cmd.length - i);
      } else if (c === "$" && cmd[i + 1] === "(") {
        stack.push("group");
        len = 2;
      } else if (ctx !== "double") {
        if (c === "'") stack.push("single");
        else if (c === '"') stack.push("double");
        else if (c === "(") stack.push("group");
      }
    }
    out += cmd.slice(i, i + len);
    i += len;
  }
  return out;
}
