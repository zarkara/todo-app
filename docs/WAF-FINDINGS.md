# Well-Architected findings and remediation

Tracks every finding from the AWS Well-Architected review and the authentication/authorization review, and how each one is fixed and validated. Each fix lands test-first in its own commit and updates its row here.

**Status:** `Open` · `Fixed` (code merged on this branch, with validation named) · `Planned` (scheduled for a later phase)

**Validation sources:** unit/HTTP tests (`npm test`), Postgres integration tests (`npm run test:integration`), and the live security-layer checks against the composed stack (`scripts/validate-security.sh`), which also run in CI.

## Phase 1: before the first deployment (this branch)

| ID              | Pillar                 | Risk   | Finding                                                                               | Fix                                                                                                                          | Status | Validated by |
| --------------- | ---------------------- | ------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ |
| SEC-1 / AUTH-1  | Security               | High   | Known default signing secret and demo accounts ship enabled, with no production guard | Refuse to start in production with a known development secret or demo users                                                  | Open   |              |
| SEC-2           | Security               | Medium | Database connections have no TLS                                                      | `DATABASE_SSL` modes (`disable`, `require`, `verify-full` with CA bundle); production may not use `disable`                  | Open   |              |
| REL-1           | Reliability            | Medium | Database pool has no connection, statement or idle timeouts                           | Bounded pool with connection, statement, query and idle timeouts                                                             | Open   |              |
| REL-2           | Reliability            | Medium | `/health` doesn't check the database                                                  | `/ready` runs `SELECT 1` and returns 503 when the database is unreachable; compose health check uses it                      | Open   |              |
| OPS-3           | Operational excellence | Medium | Schema applied unversioned by every replica at start-up; replicas can race            | Versioned migrations under a Postgres advisory lock, recorded in `schema_migrations`; also runnable as a one-off deploy step | Open   |              |
| AUTH-4 / SEC-4  | Security               | Medium | A token outlives its user: reads succeed, writes return 500                           | Resolve the user on every authenticated request; 401 when the user no longer exists                                          | Open   |              |
| AUTH-6          | Security               | Low    | Tokens have no issuer or audience                                                     | Issue and verify `iss` and `aud`                                                                                             | Open   |              |
| AUTH-11         | Security               | Low    | Bearer scheme matched case-sensitively                                                | Case-insensitive scheme matching                                                                                             | Open   |              |
| AUTH-2 / SEC-3  | Security               | Medium | Login rate limit bypassed by forging `X-Forwarded-For` on the published API port      | Stop publishing the API port; all traffic enters through nginx                                                               | Open   |              |
| AUTH-10 / SEC-5 | Security               | Low    | Postgres published on all interfaces; nginx master runs as root                       | Bind Postgres to `127.0.0.1`; unprivileged nginx image                                                                       | Open   |              |
| PERF-5          | Performance            | Low    | nginx doesn't compress responses                                                      | gzip for text assets                                                                                                         | Open   |              |
| —               | Security               | —      | Security layers aren't validated against the running system                           | Live security-layer checks plus a deploy-idempotency check, both in CI                                                       | Open   |              |

## Phase 2 and later

| ID             | Pillar                 | Risk         | Finding                                         | Planned fix                                                          | Status         |
| -------------- | ---------------------- | ------------ | ----------------------------------------------- | -------------------------------------------------------------------- | -------------- |
| OPS-1          | Operational excellence | High         | No infrastructure as code                       | Terraform for VPC, ECS, ALB, RDS, CloudFront, WAF, IAM; `plan` in CI | Planned (next) |
| OPS-2          | Operational excellence | High         | No observability                                | JSON logs with request ids, metrics, tracing, alarms                 | Planned        |
| OPS-4          | Operational excellence | Medium       | No deployment pipeline or automatic rollback    | OIDC → ECR → ECS blue/green with alarm rollback                      | Planned        |
| SEC-3 (edge)   | Security               | Medium       | No edge firewall                                | AWS WAF managed rules and a login rate rule                          | Planned        |
| AUTH-3         | Security               | Medium       | Tokens can't be revoked                         | Token version per user, short-lived tokens with refresh              | Planned        |
| AUTH-5         | Security               | Medium       | Bearer token readable by page scripts           | httpOnly cookie session with CSRF protection                         | Planned        |
| AUTH-7 / REL-3 | Security, Reliability  | Low / Medium | Rate limit per IP and per instance only         | Per-account limit in a shared store (Redis)                          | Planned        |
| AUTH-8         | Security               | Low          | No password policy                              | Policy and breached-password check with sign-up                      | Planned        |
| AUTH-9         | Security               | Low          | No authentication audit trail                   | Structured security events and alarms                                | Planned        |
| SEC-6          | Security               | Low          | Encryption at rest and TLS to tasks unspecified | KMS for RDS and logs; ACM on CloudFront and ALB                      | Planned        |
| REL-4          | Reliability            | Low          | No RPO/RTO or restore rehearsal                 | Document objectives; PITR; quarterly restore test                    | Planned        |
| PERF-1         | Performance            | Medium       | Search filters in Node, not SQL                 | `ILIKE` with a `pg_trgm` index                                       | Planned        |
| PERF-2         | Performance            | Medium       | No pagination                                   | Cursor pagination                                                    | Planned        |
| PERF-3         | Performance            | Low          | Reorder issues one upsert per task              | Single `UPDATE … FROM unnest(...)`                                   | Planned        |
| PERF-4         | Performance            | Low          | Pure-JS bcrypt is CPU-heavy                     | Native bcrypt or argon2; CPU-based scaling                           | Planned        |
| COST-1         | Cost                   | Medium       | Static SPA on an always-on ECS service          | S3 and CloudFront for the web tier                                   | Planned        |
| COST-2         | Cost                   | Low          | x86-only images                                 | Multi-arch builds; Graviton                                          | Planned        |
| COST-3         | Cost                   | Low          | NAT gateway for AWS API access                  | VPC endpoints                                                        | Planned        |
| COST-4         | Cost                   | Low          | No cost guardrails                              | Budgets, alerts, cost tags                                           | Planned        |
| SUS-1          | Sustainability         | Low          | Fixed capacity at all hours                     | Target-tracking auto scaling                                         | Planned        |
| SUS-2          | Sustainability         | Low          | Always-on web tier                              | Covered by COST-1                                                    | Planned        |
