import { Bullet } from "../bullet";
import { Lede } from "../lede";
import { Section } from "../section";

const CODE = "font-mono text-gray-600 dark:text-gray-300";

export function ValidationSection() {
  return (
    <Section
      id="validation"
      title="Validation"
      description={
        <>
          The app refuses to save invalid YAML and underlines schema problems as
          you type. For a full check, run{" "}
          <code className="font-mono text-gray-600 dark:text-gray-300">
            lpm config validate &lt;file&gt;
          </code>
          , which looks at the project with its layers applied and verifies
          that:
        </>
      }
      last
    >
      <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        <Bullet>
          At least one service is defined (duplicates are exempt — they inherit
          their parent&rsquo;s)
        </Bullet>
        <Bullet>
          Every <code className={CODE}>cmd</code>{" "}is non-empty
        </Bullet>
        <Bullet>
          Ports are whole numbers up to 65535, and no two services share one
        </Bullet>
        <Bullet>
          Every <code className={CODE}>cwd</code>{" "}points to an existing folder
        </Bullet>
        <Bullet>
          Profiles and <code className={CODE}>dependsOn</code>{" "}only name
          services that exist, with no dependency cycles
        </Bullet>
        <Bullet>There are no unknown fields</Bullet>
      </ul>
      <Lede className="mt-4 mb-0">
        When you press Start, the app itself stops on a dependency cycle or on
        a <code className="font-mono">dependsOn</code>{" "}or profile entry that
        names a missing service, and tells you which.
      </Lede>
    </Section>
  );
}
