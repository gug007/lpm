import type { ProjectFiles } from "./types";

// Working-tree content: the files marked modified or added in the project's
// changedFiles show the "+" side of their diff, at the line numbers the hunk
// headers claim.
export const SAAS_APP: ProjectFiles = {
  paths: [
    ".env.example",
    ".gitignore",
    "Gemfile.lock",
    "pnpm-lock.yaml",
    "app/controllers/api/v1/plans_controller.rb",
    "app/controllers/api/v1/users_controller.rb",
    "app/controllers/health_controller.rb",
    "app/jobs/mailer_job.rb",
    "app/models/subscription.rb",
    "app/models/user.rb",
    "bin/rails",
    "bin/sidekiq",
    "config/database.yml",
    "config/routes.rb",
    "config/sidekiq.yml",
    "db/seeds.rb",
    "public/favicon.ico",
    "src/app/api/session/route.ts",
    "src/app/dashboard/page.tsx",
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/components/button.test.tsx",
    "src/components/button.tsx",
    "src/lib/auth.test.ts",
    "src/lib/auth.ts",
    "src/lib/helpers.ts",
    "src/lib/shared.ts",
    "src/lib/utils.test.ts",
    "src/lib/utils.ts",
    "src/middleware.ts",
  ],
  content: {
    ".lpm.yml": `name: saas-app
root: ~/Projects/saas-app

services:
  web: pnpm dev
  api:
    cmd: bin/rails s -p 4000
    port: 4000
  worker: bundle exec sidekiq

actions:
  test: pnpm test
  migrate: bin/rails db:migrate
  deploy:
    cmd: ./scripts/deploy.sh production
    confirm: true

profiles:
  default: [web, api, worker]
  frontend: [web]
`,
    "README.md": `# saas-app

Billing, plans and team management. Next.js on the front, Rails on the API,
Sidekiq for anything that outlives a request.

## Running it

\`\`\`bash
pnpm install && bundle install
pnpm dev          # :3000
bin/rails s       # :4000
bundle exec sidekiq
\`\`\`

lpm starts all three at once — see \`.lpm.yml\`.

## Layout

| Path  | What lives there                         |
| ----- | ---------------------------------------- |
| src/  | the Next.js app, its routes and its lib  |
| app/  | Rails models, controllers and jobs       |
| db/   | schema and migrations                    |

## Environment

Copy \`.env.example\` to \`.env\`. \`STRIPE_SECRET_KEY\` is the only value
without a working default.
`,
    "package.json": `{
  "name": "saas-app",
  "private": true,
  "version": "2.4.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "16.3.0",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "stripe": "^14.2.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^26.2.0",
    "@types/react": "^19.2.18",
    "eslint": "^9.39.5",
    "typescript": "^6.0.3",
    "vitest": "^2.1.4"
  }
}
`,
    "vitest.config.ts": `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
`,
    "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "next-env.d.ts"],
  "exclude": ["node_modules"]
}
`,
    "next.config.ts": `import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: "http://localhost:4000/api/v1/:path*" }];
  },
};

export default config;
`,
    "Gemfile": `source "https://rubygems.org"

ruby "3.3.4"

gem "rails", "~> 7.1.3"
gem "pg", "~> 1.5"
gem "puma", "~> 6.4"
gem "sidekiq", "~> 7.2"

group :development, :test do
  gem "debug"
  gem "rspec-rails"
end
`,
    // The billing diff's "+" side: the fallback price and the trial land here.
    "src/lib/billing.ts": `import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-10",
});

export const PRICES = {
  starter: "price_starter_monthly",
  pro: "price_pro_monthly",
  team: "price_team_monthly",
} as const;

export async function createSubscription(email: string, plan: keyof typeof PRICES) {
  const customer = await stripe.customers.create({ email });
  const price = PRICES[plan] ?? PRICES.starter;
  return stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price }],
    trial_period_days: 14,
  });
}

export async function markPaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  await fetch(\`\${process.env.API_URL}/api/v1/subscriptions/paid\`, {
    method: "POST",
    body: JSON.stringify({ customer: invoice.customer }),
  });
}
`,
    // Written this session and still half-finished: body and secret are not
    // defined yet. Tidying it here would contradict the Review tab's diff.
    "src/lib/stripe-webhook.ts": `import { stripe } from "./billing";

export async function handleWebhook(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const event = stripe.webhooks.constructEvent(body, sig, secret);
  if (event.type === "invoice.paid") await markPaid(event);
  return new Response(null, { status: 200 });
}
`,
    "src/components/PlanCard.tsx": `import { Badge } from "./badge";

type Props = {
  plan: { name: string; price: string; popular?: boolean };
};

export function PlanCard({ plan }: Props) {
  return (
    <div className="rounded-xl border p-5 shadow-sm">
      {plan.popular && <Badge>Most popular</Badge>}
      <h3>{plan.name}</h3>
      <p className="text-2xl font-semibold">{plan.price}</p>
      <button className="mt-4 w-full rounded-md bg-black py-2 text-white">
        Choose {plan.name}
      </button>
    </div>
  );
}
`,
    "app/models/plan.rb": `# frozen_string_literal: true

class Plan < ApplicationRecord
  has_many :subscriptions, dependent: :restrict_with_error

  validates :name, presence: true, uniqueness: true
  validates :price, numericality: { greater_than_or_equal_to: 0 }

  scope :published, -> { where(published: true).order(:price) }

  def to_api
    { id: id, name: name, price: price }
  end
end
`,
    "db/schema.rb": `ActiveRecord::Schema[7.1].define(version: 2026_08_14_101500) do
  enable_extension "pgcrypto"

  create_table "users", id: :uuid, force: :cascade do |t|
    t.string "email", null: false
    t.string "name"
    t.timestamps
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  create_table "plans", id: :uuid, force: :cascade do |t|
    t.string "name", null: false
    t.decimal "price", precision: 8, scale: 2, null: false
    t.boolean "published", default: false, null: false
    t.timestamps
  end

  create_table "subscriptions", id: :uuid, force: :cascade do |t|
    t.uuid "user_id", null: false
    t.uuid "plan_id", null: false
    t.string "stripe_id"
    t.datetime "trial_ends_at"
    t.timestamps
  end
end
`,
    "scripts/deploy.sh": `#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="\${1:-staging}"

echo "==> Building for $ENVIRONMENT"
pnpm build
bundle exec rails assets:precompile

echo "==> Running migrations"
bin/rails db:migrate

echo "==> Pushing release"
git push "$ENVIRONMENT" HEAD:main

echo "==> Done"
`,
  },
};
