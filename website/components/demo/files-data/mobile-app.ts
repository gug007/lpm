import type { ProjectFiles } from "./types";

export const MOBILE_APP: ProjectFiles = {
  paths: [
    ".gitignore",
    "App.tsx",
    "babel.config.js",
    "jest.setup.js",
    "metro.config.js",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "android/app/build.gradle",
    "android/app/src/main/AndroidManifest.xml",
    "android/build.gradle",
    "android/settings.gradle",
    "ios/Podfile",
    "ios/Podfile.lock",
    "ios/mobileapp.xcodeproj/project.pbxproj",
    "ios/mobileapp.xcworkspace/contents.xcworkspacedata",
    "ios/mobileapp/AppDelegate.swift",
    "ios/mobileapp/Info.plist",
    "src/components/PlanCardRow.tsx",
    "src/components/ScreenHeader.tsx",
    "src/lib/helpers.ts",
    "src/lib/push.ts",
    "src/lib/session.test.ts",
    "src/lib/session.ts",
    "src/lib/shared.ts",
    "src/navigation/RootNavigator.tsx",
    "src/screens/PlansScreen.test.tsx",
    "src/screens/SettingsScreen.tsx",
    "src/screens/SignInScreen.tsx",
    "src/screens/UsageScreen.tsx",
  ],
  content: {
    ".lpm.yml": `name: mobile-app
root: ~/Projects/mobile-app

services:
  metro:
    cmd: pnpm start
    port: 8081

actions:
  types: pnpm exec tsc --noEmit
  test: pnpm test
  ios: xcodebuild -workspace ios/mobileapp.xcworkspace -scheme mobileapp
  update:
    cmd: eas update --branch production
    confirm: true
`,
    "README.md": `# mobile-app

The Expo client: sign in, plans, usage, push. Talks to the same API as the
web app.

## Running it

\`\`\`bash
pnpm install
pnpm start            # metro on :8081
pnpm ios              # or press "i" in the metro console
\`\`\`

## Layout

    src/screens      one file per screen
    src/navigation   the stack, and where each screen is registered
    src/lib          API client, session storage, push registration

## Shipping

\`eas update --branch production\` pushes a JS-only update to the current
runtime. Anything touching native code needs a new build instead.
`,
    "package.json": `{
  "name": "mobileapp",
  "version": "1.4.0",
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "test": "jest",
    "types": "tsc --noEmit"
  },
  "dependencies": {
    "expo": "~51.0.28",
    "expo-secure-store": "~13.0.2",
    "expo-updates": "~0.25.24",
    "react": "18.2.0",
    "react-native": "0.74.5",
    "@react-navigation/native": "^6.1.18",
    "@react-navigation/native-stack": "^6.11.0"
  },
  "devDependencies": {
    "@types/react": "~18.2.79",
    "jest": "^29.7.0",
    "jest-expo": "~51.0.4",
    "typescript": "~5.3.3"
  },
  "private": true
}
`,
    "app.json": `{
  "expo": {
    "name": "mobileapp",
    "slug": "mobileapp",
    "version": "1.4.0",
    "orientation": "portrait",
    "scheme": "mobileapp",
    "userInterfaceStyle": "automatic",
    "ios": {
      "bundleIdentifier": "com.example.mobileapp",
      "supportsTablet": true
    },
    "android": {
      "package": "com.example.mobileapp"
    },
    "updates": {
      "url": "https://u.expo.dev/00000000-0000-0000-0000-000000000000"
    },
    "runtimeVersion": "1.4.0"
  }
}
`,
    "eas.json": `{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "ios": {
        "resourceClass": "m-medium"
      },
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleTeamId": "XXXXXXXXXX"
      }
    }
  },
  "update": {
    "production": {
      "channel": "production"
    }
  }
}
`,
    "jest.config.js": `module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*))",
  ],
};
`,
    "index.ts": `import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
`,
    "src/lib/format.ts": `const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatPrice(cents: number): string {
  return formatter.format(cents / 100);
}

export function formatCount(n: number): string {
  return n >= 1000 ? \`\${Math.round(n / 100) / 10}k\` : String(n);
}
`,
    "src/lib/api.ts": `import { getToken } from "./session";

export const API = process.env.EXPO_PUBLIC_API_URL ?? "https://api.example.com";

async function authed(path: string, init: RequestInit = {}) {
  const token = await getToken();
  const res = await fetch(\`\${API}\${path}\`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: \`Bearer \${token}\`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(\`\${init.method ?? "GET"} \${path} → \${res.status}\`);
  return res;
}

export type Plan = {
  id: string;
  name: string;
  priceCents: number;
  /** Days of free trial the API grants, or null when the plan has none. */
  trialDays: number | null;
};

export async function fetchPlans(): Promise<Plan[]> {
  const res = await authed("/v1/plans");
  const rows: PlanRow[] = await res.json();
  return rows.map(toPlan);
}

type PlanRow = {
  id: string;
  name: string;
  price: number;
  trial_period_days?: number;
};

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    priceCents: Math.round(row.price * 100),
    trialDays: row.trial_period_days ?? null,
  };
}

export async function subscribe(planId: string): Promise<void> {
  await authed("/v1/subscriptions", {
    method: "POST",
    body: JSON.stringify({ plan_id: planId }),
  });
}
`,
    "src/screens/PlansScreen.tsx": `import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { fetchPlans, subscribe, type Plan } from "../lib/api";
import { formatPrice } from "../lib/format";
import { ScreenHeader } from "../components/ScreenHeader";

export function PlansScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPlans()
      .then((next) => live && setPlans(next))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Plans" />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Plans" />
      <FlatList
        data={plans}
        keyExtractor={(plan) => plan.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <PlanRow plan={item} />}
      />
    </View>
  );
}

function PlanRow({ plan }: { plan: Plan }) {
  return (
    <View style={styles.card}>
      <Text style={styles.planName}>{plan.name}</Text>
      <Text style={styles.price}>{formatPrice(plan.priceCents)}</Text>
      {plan.trialDays ? (
        <Text style={styles.trial}>{plan.trialDays} days free</Text>
      ) : null}
      <Pressable style={styles.cta} onPress={() => subscribe(plan.id)}>
        <Text style={styles.ctaLabel}>
          {plan.trialDays ? "Start free trial" : "Choose plan"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  list: {
    padding: 16,
    gap: 12,
  },
  error: {
    padding: 16,
    color: "#dc2626",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 20,
  },
  planName: {
    fontSize: 15,
    color: "#6b7280",
  },
  price: {
    fontSize: 28,
    fontWeight: "600",
  },
  trial: {
    marginTop: 4,
    fontSize: 13,
    color: "#16a34a",
  },
  cta: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#111827",
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaLabel: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
`,
  },
};
