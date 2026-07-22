export const PROJECT_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
`;

export const SERVICES_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  # shorthand — key is the name, value is the command
  server: node server.js

  # full form — use this when you need cwd, port, env, or dependsOn
  web:
    cmd: npm run dev
    cwd: ./web                # run from a subfolder (great for monorepos)
    port: 3000                # unique per project; shown as a link in the app
    dependsOn: [server]       # start "server" first, pulled in automatically
    env:                      # extra env vars just for this service
      API_URL: http://localhost:4000
`;

export const SERVICES_DEPENDS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  db: docker compose up postgres
  api:
    cmd: npm run api
    dependsOn: [db]           # lpm starts db before api
  web:
    cmd: npm run dev
    dependsOn: [api]          # lpm starts api before web
`;

export const ACTIONS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  test: npm test              # shorthand

  deploy:                     # full form
    cmd: ./scripts/deploy.sh
    label: Deploy to Production  # display name in the UI
    confirm: true             # ask before running
    display: header           # main button row (default; omit to get the same)
    env:
      NODE_ENV: production
`;

export const ACTIONS_SHORTHAND_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  test: npm test
  lint: npm run lint
  build: npm run build
  typecheck: npx tsc --noEmit
  format: npx prettier --write .
`;

export const ACTIONS_DESTRUCTIVE_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  reset-cache:
    cmd: rm -rf .next node_modules/.cache
    label: Reset Cache
    confirm: true
    display: header
  rollback:
    cmd: ./scripts/rollback.sh
    label: Rollback Deploy
    confirm: true
    env:
      NODE_ENV: production
`;

export const ACTIONS_BACKGROUND_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  db-reset:
    cmd: npm run db:reset && npm run db:seed
    label: Reset DB
    type: background       # runs hidden, notifies on completion
    confirm: true          # pair with confirm for destructive ones
`;

export const ACTIONS_NESTED_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  deploy:
    cmd: ./deploy.sh staging     # split button — main click runs this
    label: Deploy
    emoji: 🚀                    # icon shown next to the label
    display: header
    confirm: true
    actions:                     # chevron opens these
      production:
        cmd: ./deploy.sh production
        label: Production
        emoji: 🔴
        confirm: true
      preview:
        cmd: ./deploy.sh preview
        label: Preview
        emoji: 👁️
`;

export const ACTIONS_PRIMARY_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  deploy:
    label: Deploy
    emoji: 🚀
    display: header
    primary: last-used           # main click repeats the last used option
    actions:                     # chevron opens these
      staging:
        cmd: ./deploy.sh staging
        label: Staging
        emoji: 🟢
      production:
        cmd: ./deploy.sh production
        label: Production
        emoji: 🔴
        confirm: true
`;

export const ACTIONS_DROPDOWN_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  db:
    label: Database
    emoji: 🗄️
    display: header
    cwd: ./backend
    actions:
      migrate:
        cmd: python manage.py migrate
        label: Migrate
        emoji: 📦
      seed:
        cmd: python manage.py seed
        label: Seed
        emoji: 🌱
      reset:
        cmd: python manage.py flush
        label: Reset
        emoji: 💣
        confirm: true
`;

export const TERMINALS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  codex:                      # minimal — key becomes the label
    cmd: codex
    type: terminal

  claude:                     # full form
    cmd: claude
    label: Claude Code        # nicer name than the key
    display: header           # pin to the toolbar, one click away (default)
    type: terminal
`;

export const TERMINALS_AGENTS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  claude:
    cmd: claude              # AI pair programmer
    type: terminal
  codex:
    cmd: codex               # another AI agent, swap at will
    type: terminal
  node:
    cmd: node                # quick REPL for poking at things
    type: terminal
  logs:
    cmd: tail -f ./logs/dev.log  # live-tail your dev server logs
    type: terminal
`;

export const PROFILES_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev              # frontend UI
  api:
    cmd: node server.js
    port: 4000                  # backend API
profiles:
  # Just the frontend — fastest startup, good for UI-only fixes
  frontend: [web]
  # Full stack — frontend + backend for feature work
  full:     [web, api]
`;

export const PROFILES_MULTI_EXAMPLE = `name: shop
root: ~/Projects/shop
services:
  web: npm run dev              # React frontend
  api:
    cmd: python -m api.server
    port: 5000                  # Flask backend
  worker: celery -A tasks       # background jobs
profiles:
  # Quick UI fixes — no backend needed
  frontend: [web]
  # Normal day-to-day development — web + api
  local:    [web, api]
  # Everything, including background workers
  full:     [web, api, worker]
`;

export const GLOBAL_CONFIG_EXAMPLE = `actions:
  docker-prune:
    cmd: docker system prune -f
    label: Docker Prune
    confirm: true             # asks before wiping images and caches

  htop:
    cmd: htop                 # live system monitor, one click away
    type: terminal
`;

export const GLOBAL_UTILITIES_EXAMPLE = `actions:
  prune-branches:
    cmd: git branch --merged main | grep -v main | xargs git branch -d
    label: Prune merged branches
    confirm: true             # deletes local branches — ask first
  brew-upgrade:
    cmd: brew update && brew upgrade
    label: Brew upgrade       # keep Homebrew packages fresh

  htop:
    cmd: htop                 # live CPU and memory
    type: terminal
  btop:
    cmd: btop                 # prettier process viewer
    type: terminal
  ncdu:
    cmd: ncdu ~               # explore what's eating your disk
    type: terminal
`;

export const RECIPE_MINIMAL = `name: blog
root: ~/Projects/blog
services:
  web: npm run dev # the only thing you need to hit Start
`;

export const RECIPE_TESTS = `name: blog
root: ~/Projects/blog
services:
  web: npm run dev
actions:
  # one-click buttons for the chores you used to retype
  test: npm test
  lint: npm run lint
  build: npm run build
`;

export const RECIPE_NEXT_NODE = `name: webapp
root: ~/Projects/webapp
services:
  web: npm run dev # Next.js front-end
  server:
    cmd: node server.js # API the front-end talks to
    cwd: ./server # lives in a subfolder
    port: 4000 # surfaced in the app so you can open it
actions:
  deploy:
    cmd: ./scripts/deploy.sh
    confirm: true # ask before shipping
  logs:
    cmd: tail -f ./logs/server.log # keep server logs one click away
    type: terminal
`;

export const RECIPE_ENV = `name: webapp
root: ~/Projects/webapp
services:
  web:
    cmd: npm run dev
    port: 3000
    env:
      # dev-only values — real secrets belong in your own .env
      API_URL: http://localhost:4000
      NEXTAUTH_SECRET: dev-secret
      NODE_ENV: development
`;

export const RECIPE_MONOREPO = `name: mono
root: ~/Projects/mono
services:
  web:
    cmd: npm run dev
    cwd: ./apps/web # one app in the monorepo
    port: 3000
  docs:
    cmd: npm run dev
    cwd: ./apps/docs # another app, started together
    port: 3001
`;
