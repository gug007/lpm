import {
  PROFILES_EXAMPLE,
  PROFILES_MULTI_EXAMPLE,
} from "@/app/config/examples";
import { Callout } from "../callout";
import { Lede } from "../lede";
import { ConfigPlayground } from "../playground";
import { Section } from "../section";
import { Strong } from "../strong";

export function ProfilesSection() {
  return (
    <Section
      id="profiles"
      title="Profiles"
      description={
        <>
          Profiles group services into <Strong>named workflows</Strong>{" "}so you
          don&rsquo;t have to spin up everything every time. Working on a CSS
          tweak? Start just the frontend. Building a feature end-to-end? Fire
          up the full stack. Pick a profile from the{" "}
          <Strong>Start button&rsquo;s dropdown</Strong>{" "}in the project toolbar
          and lpm starts those services right away, plus anything they depend
          on.
        </>
      }
    >
      <Lede title="Start small." className="mb-3">
        Even two profiles pay off right away — a lightweight one for quick UI
        fixes and a full one for feature work. Here&rsquo;s the smallest
        useful setup: a frontend and a backend, with a{" "}
        <code className="font-mono">frontend</code>{" "}profile that skips the API
        when you don&rsquo;t need it:
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/myapp.yml"
        initial={PROFILES_EXAMPLE}
      />
      <Lede className="mt-3">
        Every name in a profile list must match a service defined above in{" "}
        <code className="font-mono">services</code>. Services can appear in as
        many profiles as you like — overlap is fine and expected.
      </Lede>

      <Lede title="Multiple profiles for different modes.">
        Once your project grows a third or fourth service — a background
        worker, a queue, a second frontend — a single profile isn&rsquo;t
        enough. Define one profile per workflow you actually use, so you can
        jump between &ldquo;just the UI&rdquo;, &ldquo;normal dev&rdquo;, and
        &ldquo;everything running&rdquo; without touching the config:
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/shop.yml"
        initial={PROFILES_MULTI_EXAMPLE}
      />

      <Callout title="What does a plain Start run?">
        <p>
          With no profiles, <Strong>Start</Strong>{" "}runs every service. Once a
          project has profiles, Start runs the profile you last started since
          opening the app — otherwise the first profile in alphabetical order,
          which is how the dropdown lists them. In the examples above,
          that&rsquo;s <code className="font-mono">frontend</code>. To choose
          what a plain Start runs from the beginning, give that profile a name
          that sorts first.
        </p>
      </Callout>
    </Section>
  );
}
