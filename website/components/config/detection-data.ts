export type DetectionRow = {
  stack: string;
  reads: string;
  command?: string;
  alt?: string;
  name: string;
  port: string;
};

export const DETECTION_ROWS: DetectionRow[] = [
  {
    stack: "Procfile",
    reads: "Procfile.dev, else Procfile",
    alt: "One service per process line; release is skipped",
    name: "the process name",
    port: "from the command",
  },
  {
    stack: "Node.js",
    reads: "package.json dev, start, or serve script",
    command: "npm run dev",
    alt: "or pnpm, yarn, bun — whichever the repo declares or locks",
    name: "web, api, or app",
    port: "the script's, else the framework's: Next.js 3000, Vite 5173, Astro 4321…",
  },
  {
    stack: "Deno",
    reads: "deno.json dev, start, or serve task",
    command: "deno task dev",
    name: "app",
    port: "from the task",
  },
  {
    stack: "Django",
    reads: "manage.py",
    command: "python3 manage.py runserver",
    name: "web",
    port: "8000",
  },
  {
    stack: "FastAPI",
    reads: "fastapi dependency + an app module like main.py",
    command: "uvicorn main:app --reload",
    name: "api",
    port: "8000",
  },
  {
    stack: "Flask",
    reads: "flask dependency + app.py or wsgi.py",
    command: "flask run --debug",
    name: "web",
    port: "5000",
  },
  {
    stack: "Rails",
    reads: "Gemfile with rails + bin/rails",
    command: "bin/dev",
    alt: "else bin/rails server",
    name: "web",
    port: "3000",
  },
  {
    stack: "Laravel",
    reads: "artisan",
    command: "php artisan serve",
    name: "web",
    port: "8000",
  },
  {
    stack: "Phoenix",
    reads: "mix.exs with :phoenix",
    command: "mix phx.server",
    name: "web",
    port: "4000",
  },
  {
    stack: "Spring Boot",
    reads: "Spring Boot in pom.xml or build.gradle",
    command: "./mvnw spring-boot:run",
    alt: "mvn spring-boot:run without mvnw; ./gradlew bootRun for Gradle",
    name: "web",
    port: "8080",
  },
  {
    stack: ".NET",
    reads: "a single .csproj",
    command: "dotnet watch run",
    name: "app",
    port: "—",
  },
  {
    stack: "Go",
    reads: "go.mod",
    command: "go run .",
    alt: "air with an .air.toml; go run ./cmd/<name> per command when there's no main.go",
    name: "app, or the command's name",
    port: "from the command",
  },
  {
    stack: "Rust",
    reads: "Cargo.toml with a binary",
    command: "cargo run",
    alt: "cargo run -p <crate> for each workspace binary",
    name: "app, or the crate's name",
    port: "from the command",
  },
  {
    stack: "Docker Compose",
    reads: "compose.yml or docker-compose.yml",
    command: "docker compose up",
    name: "compose",
    port: "—",
  },
  {
    stack: "make / just",
    reads: "Makefile or justfile, when nothing else matched",
    command: "make dev",
    alt: "or just dev; serve, run, and start targets work too",
    name: "app",
    port: "—",
  },
];
