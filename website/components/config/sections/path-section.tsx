import { Bullet } from "../bullet";
import { Section } from "../section";

const CODE = "font-mono text-gray-600 dark:text-gray-300";

export function PathSection() {
  return (
    <Section id="path-resolution" title="Path resolution">
      <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        <Bullet>
          <code className={CODE}>~</code>{" "}expands to your home directory in{" "}
          <code className={CODE}>root</code>
        </Bullet>
        <Bullet>
          Relative <code className={CODE}>cwd</code>{" "}paths resolve relative to{" "}
          <code className={CODE}>root</code>
        </Bullet>
        <Bullet>Absolute paths are used as-is</Bullet>
        <Bullet>
          On a local project, <code className={CODE}>~</code>{" "}is not expanded
          in <code className={CODE}>cwd</code>{" "}— a{" "}
          <code className={CODE}>~/…</code>{" "}working folder is read as a folder
          named <code className={CODE}>~</code>{" "}inside the project, so use a
          relative or absolute path there
        </Bullet>
        <Bullet>
          On an SSH project, a relative <code className={CODE}>cwd</code>{" "}
          resolves from <code className={CODE}>ssh.dir</code>, and{" "}
          <code className={CODE}>~</code>{" "}means your home folder on the remote
          host
        </Bullet>
      </ul>
    </Section>
  );
}
