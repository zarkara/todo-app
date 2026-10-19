# Plan: create an account (sign-up)

## Why

Accounts exist only through `DEMO_USERS`, which production mode refuses, so a production deployment (the Mac server or Azure) has no way to create a user. A first-time visitor also can't get started without being told a demo password.

## Scope

**In:** a "Create an account" screen (email and password), linked from sign-in. A successful sign-up signs the user in and lands them on their empty task list.

**Out (this is a test app):** no email verification; anyone can register any address. Email or SMS verification, password reset, and hosted sign-in with Microsoft Entra External ID (CIAM) are listed under "Given more time" in the README. External ID would replace this sign-up: its hosted pages verify the email address, and the API would accept its tokens and create the matching user on first sign-in. The task code and per-user scoping stay the same either way.

## Behaviour

| Case                                             | Result                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Valid email, password 8–16 characters            | `201 { token, user }`; the browser is signed in and shows "Your tasks" (empty)         |
| Email already registered (any letter case)       | `409 EMAIL_TAKEN`: "An account with this email already exists." with a link to sign in |
| Invalid email, or password too short or too long | `400 VALIDATION_ERROR` with field messages, shown under the fields                     |
| Too many sign-ups from one address               | `429 RATE_LIMITED` (5 per hour, every attempt counts)                                  |

- **Password rule:** 8 to 16 characters, with no composition rules. The 16-character maximum is a product decision; NIST SP 800-63B recommends allowing at least 64 so people can use passphrases, so it is the first thing to revisit.
- **Emails** are trimmed and lower-cased, as they are for sign-in.
- **Enumeration:** a 409 reveals that an address is registered. That is inherent to sign-up without email verification and accepted here; the rate limit bounds how fast addresses can be probed.

## Test users: one inbox, many accounts

Use plus addressing (sub-addressing) to create as many test accounts as needed from a single real mailbox: everything after a `+` in the local part is ignored for delivery, so `you+1@gmail.com`, `you+2@gmail.com` and `you+smoke-7@gmail.com` all arrive in `you@gmail.com`.

- **Pattern:** `<name>+<n>@<domain>`, counting up (`+1`, `+2`, …) for manual testing, and `+smoke-<run id>` for automated runs, so every run gets a new account.
- **This app treats each one as a separate account.** Emails are only trimmed and lower-cased; the `+` part is kept, so `you+1@…` and `you+2@…` have separate tasks. (Checked: the shared email schema accepts and keeps `+` addresses.)
- **Why it matters later:** today nothing is emailed, so any address works, including the reserved `example.test` domain. Once verification exists (a one-time code, or Microsoft Entra External ID), the codes for every test account arrive in the one inbox you can read.
- **Providers:** Gmail, Outlook.com and Microsoft 365 deliver plus addresses by default. Some providers and some sites don't; check before relying on one.
- **Trade-off:** the same pattern lets one person create unlimited accounts. That's acceptable for a test app; a real deployment would rely on verification and the sign-up rate limit, and would ignore the `+` part when checking for a taken email (listed under "Given more time" in the README).

**Smoke test:** by default it signs up `smoke+<run id>@example.test`, which needs no real mailbox. Set `SMOKE_EMAIL=you@gmail.com` and it signs up `you+smoke-<run id>@gmail.com` instead, ready for when codes are sent.

## Design, by layer

| Layer             | Change                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared` | `registerSchema` (email as in `loginSchema`; the password rule above), reused by the API and the form                                                                                                                                                              |
| Domain            | `EmailTakenError`, a new 409 error (`EMAIL_TAKEN`)                                                                                                                                                                                                                 |
| Repository port   | `create(user)`: insert only, rejects a taken email with `EmailTakenError`. Both adapters run it through the contract suite; Postgres maps the unique-index violation (`23505` on `users_email_key`), so two simultaneous sign-ups for one email can't both succeed |
| Service           | `authService.register`: hash the password, create the user with a new id, issue a token (same response as `login`)                                                                                                                                                 |
| HTTP              | `POST /auth/register` with its own limiter; the shared error handler returns the 409                                                                                                                                                                               |
| Web               | `SignUpPage` at `/signup` (public), `useRegister` hook that stores the session, links between sign-in and sign-up                                                                                                                                                  |

Demo seeding keeps using the upsert, so existing accounts and their tasks are untouched.

## Steps (test first, gate and commit at each)

1. **Contract and storage:** `registerSchema` tests; `create` in the repository contract suite (new user, duplicate email in another letter case) against both adapters. Implement.
2. **Service and API:** service tests (creates and signs in, hashes the password, rejects a duplicate) and HTTP tests (201 with a working token, 400, 409, 429). Implement.
3. **Web:** `SignUpPage` tests with the fake API (success lands on the list, 409 and field errors shown, links both ways). Implement.
4. **End to end and docs:** the smoke test starts by creating a fresh account, which makes its empty-list step certain; `validate-security` gains duplicate, weak-password and rate-limit checks for sign-up; the README API table, "Accounts" section and requirements checklist are updated.

Estimate: about 4 hours.

## Decisions (confirmed)

1. Sign-up is open in every environment, production included.
2. Signing up signs the new user straight in.
3. Passwords are 8 to 16 characters.

## Known trade-offs

- Accounts created by the smoke test (`smoke+…@example.test`, or `you+smoke-…@…`) build up in a local database, because there is no delete-account endpoint; `docker compose down -v` clears them.
- Without verification, someone can register an address that isn't theirs. Verification is the first item under "Given more time".
