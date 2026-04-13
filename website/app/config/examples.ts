export const PROJECT_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
`;

export const SERVICES_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  # shorthand — key is the name, value is the command
  web: npm run dev

  # full form — use this when you need cwd, port, or env
  server:
    cmd: node server.js
    cwd: ./server             # run from a subfolder (great for monorepos)
    port: 4000                # unique per project; shown as a link in the app
    env:                      # extra env vars just for this service
      API_KEY: dev-secret
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
    display: button           # show as a button instead of in menu
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
    display: button
  rollback:
    cmd: ./scripts/rollback.sh
    label: Rollback Deploy
    confirm: true
    env:
      NODE_ENV: production
`;

export const ACTIONS_NESTED_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  deploy:
    cmd: ./deploy.sh staging     # split button — main click runs this
    label: 🚀 Deploy
    display: button
    confirm: true
    actions:                     # chevron opens these
      production:
        cmd: ./deploy.sh production
        label: 🔴 Production
        confirm: true
      preview:
        cmd: ./deploy.sh preview
        label: 👁️ Preview
`;

export const ACTIONS_DROPDOWN_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  db:
    label: 🗄️ Database
    display: button
    cwd: ./backend
    actions:
      migrate:
        cmd: python manage.py migrate
        label: 📦 Migrate
      seed:
        cmd: python manage.py seed
        label: 🌱 Seed
      reset:
        cmd: python manage.py flush
        label: 💣 Reset
        confirm: true
`;

export const TERMINALS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
terminals:
  codex: codex                # shorthand — key becomes the label

  claude:                     # full form
    cmd: claude
    label: Claude Code        # nicer name than the key
    display: button           # pin to the toolbar, one click away
`;

export const TERMINALS_AGENTS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
terminals:
  claude: claude              # AI pair programmer
  codex: codex                # another AI agent, swap at will
  node: node                  # quick REPL for poking at things
  logs: tail -f ./logs/dev.log  # live-tail your dev server logs
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

terminals:
  htop: htop                  # live system monitor, one click away
`;

export const GLOBAL_UTILITIES_EXAMPLE = `actions:
  prune-branches:
    cmd: git branch --merged main | grep -v main | xargs git branch -d
    label: Prune merged branches
    confirm: true             # deletes local branches — ask first
  brew-upgrade:
    cmd: brew update && brew upgrade
    label: Brew upgrade       # keep Homebrew packages fresh

terminals:
  htop: htop                  # live CPU and memory
  btop: btop                  # prettier process viewer
  ncdu: ncdu ~                # explore what's eating your disk
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
terminals:
  logs: tail -f ./logs/server.log # keep server logs one click away
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
