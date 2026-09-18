import { AUTH_PACKAGE } from "./auth-service-auth";
import type { ProjectFiles } from "./types";

// The server boots "migrations: up to date (14)", so migrations/ holds exactly
// fourteen files. bin/ is build output and stays out of the tree — .gitignore
// names it, and `ls` never lists it either.
const MIGRATIONS = [
  "0001_create_users.sql",
  "0002_create_sessions.sql",
  "0003_add_users_email_index.sql",
  "0004_create_api_keys.sql",
  "0005_add_session_expiry.sql",
  "0006_create_signing_keys.sql",
  "0007_add_key_retire_after.sql",
  "0008_create_audit_log.sql",
  "0009_add_user_mfa.sql",
  "0010_create_password_resets.sql",
  "0011_add_session_device.sql",
  "0012_drop_legacy_tokens.sql",
  "0013_add_key_algorithm.sql",
  "0014_backfill_key_kids.sql",
].map((name) => `internal/db/migrations/${name}`);

export const AUTH_SERVICE: ProjectFiles = {
  paths: [
    ".env.example",
    ".gitignore",
    "go.sum",
    "internal/api/handlers_login.go",
    "internal/api/handlers_session.go",
    "internal/api/middleware.go",
    "internal/api/router.go",
    "internal/api/router_test.go",
    "internal/auth/errors.go",
    "internal/auth/helpers.go",
    "internal/auth/jwt_test.go",
    "internal/auth/password.go",
    "internal/auth/rotation_test.go",
    "internal/auth/shared.go",
    "internal/auth/store.go",
    "internal/config/config.go",
    "internal/db/db.go",
    "internal/db/db_test.go",
    "internal/db/sessions.go",
    "internal/db/users.go",
    "k8s/configmap.yaml",
    "k8s/ingress.yaml",
    ...MIGRATIONS,
  ],
  content: {
    ...AUTH_PACKAGE,
    ".lpm.yml": `name: auth-service
root: ~/Projects/auth-service

services:
  server:
    cmd: go run ./cmd/server
    port: 8080
  postgres: docker compose up postgres
  redis: redis-server --port 6379

actions:
  test: go test ./...
  build: go build -o bin/server ./cmd/server

profiles:
  default: [server, postgres, redis]
  api-only: [server]
`,
    "README.md": `# auth-service

Sessions, tokens and key rotation for everything else. Go, Postgres, Redis.

## Running it

\`\`\`bash
docker compose up postgres -d
go run ./cmd/server        # :8080
\`\`\`

lpm brings all three up together — see \`.lpm.yml\`.

## Layout

    cmd/server      entrypoint and flags
    internal/api    HTTP handlers and middleware
    internal/auth   JWT signing, verification and key rotation
    internal/db     queries and migrations

## Key rotation

Signing keys rotate on a schedule. Retired keys stay verifiable for the grace
window in \`AUTH_KEY_GRACE\` so tokens already in flight keep working.
`,
    "go.mod": `module github.com/you/auth-service

go 1.23

require (
\tgithub.com/golang-jwt/jwt/v5 v5.2.1
\tgithub.com/jackc/pgx/v5 v5.6.0
\tgithub.com/redis/go-redis/v9 v9.6.1
\tgithub.com/stretchr/testify v1.9.0
)

require (
\tgithub.com/davecgh/go-spew v1.1.1 // indirect
\tgithub.com/jackc/pgpassfile v1.0.0 // indirect
\tgithub.com/pmezani/go-difflib v1.0.0 // indirect
\tgolang.org/x/crypto v0.26.0 // indirect
\tgolang.org/x/sync v0.8.0 // indirect
\tgopkg.in/yaml.v3 v3.0.1 // indirect
)
`,
    "Makefile": `.PHONY: run test build migrate

run:
	go run ./cmd/server

test:
	go test ./...

build:
	go build -o bin/server ./cmd/server

migrate:
	go run ./cmd/server -migrate-only
`,
    "docker-compose.yml": `services:
  postgres:
    image: postgres:16.1
    environment:
      POSTGRES_DB: api
      POSTGRES_USER: api
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7.2
    ports:
      - "6379:6379"

volumes:
  pgdata:
`,
    "cmd/server/main.go": `package main

import (
\t"flag"
\t"log"
\t"net/http"

\t"github.com/you/auth-service/internal/api"
\t"github.com/you/auth-service/internal/config"
\t"github.com/you/auth-service/internal/db"
)

func main() {
\tmigrateOnly := flag.Bool("migrate-only", false, "run migrations and exit")
\tflag.Parse()

\tlog.Println("loading config from env")
\tcfg := config.Load()

\tstore, err := db.Connect(cfg.DatabaseURL)
\tif err != nil {
\t\tlog.Fatalf("connect: %v", err)
\t}
\tlog.Printf("connected to %s", cfg.DatabaseURL)

\tapplied, err := store.Migrate()
\tif err != nil {
\t\tlog.Fatalf("migrate: %v", err)
\t}
\tlog.Printf("migrations: up to date (%d)", applied)
\tif *migrateOnly {
\t\treturn
\t}

\tmux := api.NewRouter(store, cfg)
\tmux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
\t\tw.WriteHeader(http.StatusOK)
\t})

\tlog.Println("server listening on :8080")
\tlog.Fatal(http.ListenAndServe(":8080", mux))
}
`,
    "k8s/auth-service.yaml": `apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  labels:
    app: auth-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
        - name: server
          image: ghcr.io/you/auth-service:latest
          ports:
            - containerPort: 8080
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: auth-service
                  key: database-url
            - name: AUTH_KEY_GRACE
              value: "24h"
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth-service
  ports:
    - port: 80
      targetPort: 8080
`,
  },
};
