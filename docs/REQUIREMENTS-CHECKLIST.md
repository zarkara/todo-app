# Requirements checklist

Each requirement stated in the challenge brief, checked against the code on `waf-remediation`, with evidence. The brief states no hosting or networking requirement: deployment is optional, and the reviewers run the app on a Mac.

**Legend:** `[x]` met · `[~]` gap fixed in this change · `[ ]` open gap

## Backend

- [x] **Simple backend API (Node/Express or similar):** Express 4 in `apps/api`.
- [x] **Storage appropriate to the solution:** PostgreSQL 17 with versioned migrations (`apps/api/src/db`). In-memory adapters run the same contract suites.
- [x] **REST style (resource URLs, standard methods, JSON):** `/auth/login`, `/tasks`, `/tasks/:id`, `/tasks/order` (README, REST API table).
- [x] **Standard HTTP semantics:** 200, 201 and 204 for success, 400 for validation errors, 401 for authentication, 404 for missing tasks, 429 for the login rate limit. 403 is never returned, by design: another user's task returns 404 so that its existence isn't revealed. Worth explaining in the live session.

## Frontend

- [x] **Web client connected to the custom backend:** React in `apps/web`, calling `/api` through nginx (and through the Vite proxy in development).
- [x] **Log in, then operate only on your own tasks:** every task query is scoped by `user_id` in SQL. Covered by ownership tests in the services, HTTP and repository contract suites, and by the live checks in `validate-security`.
- [x] **Responsive UI:** viewport meta, mobile-first CSS with breakpoints, 44px touch targets.

## UX hints

- [x] **Sign in from the landing page:** `/login`; unauthenticated routes redirect there (`RequireAuth`).
- [x] **Task list after signing in:** `/tasks`.
- [x] **Change the order of tasks:** drag-and-drop (mouse, touch, keyboard) and ▲/▼ buttons; transactional `PUT /tasks/order`.
- [x] **Search tasks:** debounced, kept in the URL (`?q=`).
- [x] **Open a task to view or edit it on a detail screen:** `/tasks/:id`.
- [x] **Full CRUD:** create, update (including done), delete with confirmation.

## README

- [x] **Running instructions for a Mac:** "Quick start (macOS)", one `docker compose up --build`.
- [~] **The quick start works on any Mac:** a Postgres already running on port 5432 (Homebrew, Postgres.app) made `docker compose up` fail. The database port is no longer published by default; `npm run db:up` publishes it on loopback for development (`docker-compose.dev.yml`).
- [~] **Bonus: deployment to a distributed cloud:** the out-of-date AWS notes (whose `/api` routing would have returned 404) are replaced by an Azure deployment: `infra/azure/main.bicep`, compiled to the ARM template `azuredeploy.json`, with step-by-step `az` commands. It compiles and lints against the Azure schemas but hasn't been deployed to a live subscription.
- [~] **A summary of the assignment:** the "Assignment summary" heading had no summary. Added one paragraph.
- [x] **Overall approach:** five numbered points.
- [x] **Features completed:** checklist.
- [~] **Facts in the README are current:** the test count (now 249: 221 unit and component, 28 against Postgres; 98.7% line coverage), the CI scope (every push, plus the live validation scripts) and `/ready` in the API table were out of date. Fixed.
- [~] **Given more time, with estimates:** removed versioned migrations and the readiness probe, both already done.
- [x] **Making it more robust:** six items with estimates.

## Code

- [ ] **In a git repository that can be shared:** `zarkara/todo-app` is private. Add the reviewers as collaborators, or make it public, before submitting.
- [ ] **The shared code is the finished code:** the default branch `main` is 14 commits behind `waf-remediation`, so reviewers who clone `main` get the code from before Phase 1. Decision needed: merge before submitting.
- [x] **We should be able to run the code:** `docker compose up --build`; CI starts the full stack from scratch on every push.
- [x] **Community-standard syntax and style:** ESLint and Prettier, `tsc --strict`, enforced in CI.
- [x] **No debug logging, TODOs or FIXMEs:** none in tracked files. ESLint bans `console` and TODO/FIXME comments; the server writes only operational lines (start-up, migrations, errors).
- [x] **Test coverage:** 249 tests, 98.7% lines, 80% thresholds enforced. Vitest is used (Jest-compatible API), with Testing Library, Supertest and MSW.
- [ ] **Production-ready defaults:** the compose stack runs in development mode, with the published JWT secret and `password123` demo users, on port 8080 open to the whole network (AUTH-13, HOST-1 and HOST-3 in `WAF-FINDINGS.md`). Recommended: bind the default stack to `127.0.0.1`, and add an opt-in production mode.

## Bonus criteria

- [x] **Test-driven development:** one checkpoint per commit, tests first, gate before each commit (`git log main`).
- [x] **Functional, concise, declarative code:** pure domain functions, `map`, `filter` and `reduce`, curried predicates, factories with injected dependencies.
- [x] **High-level async abstractions:** `asyncHandler`, `requireAuth`, `withTransaction`, TanStack Query with optimistic updates and rollback.

## Your actions (outside the code)

- [ ] Share the private repository with the reviewers.
- [ ] Delete the `review` branch on GitHub.
- [ ] Decide on merging `waf-remediation` into `main`.
