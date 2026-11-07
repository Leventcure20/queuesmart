# QueueSmart backend

Node.js and Express API scaffold for QueueSmart. The frontend is currently a demo with mock data; this directory establishes the backend structure for authentication and later queue features.

## Setup

Use Node.js 22.13 or newer and PostgreSQL 17 or newer. The API requires PostgreSQL to start.

```sh
npm ci
cp .env.example .env
npm run dev
```

Before starting the API for the first time, create a local PostgreSQL role and database (choose and save a password when prompted):

```sh
createuser --pwprompt queuesmart_user
createdb -O queuesmart_user queuesmart
```

For a new database, run all ten checked-in SQL files in order. They create `UserCredentials`, `UserProfile`, `Service`, password-reset storage, persistent queues, tickets, notification status/history, database-level validation constraints, and the `QueueEntry` view, then insert the three demo services:

```sh
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/001_create_user_credentials.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/002_create_user_profile.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/003_create_service.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/004_seed_services.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/005_create_password_reset_tokens.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/006_create_queue_persistence.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/007_create_service_queues.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/008_notification_history.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/009_validation_constraints.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/010_queue_entry.sql
```

Migration `010_queue_entry.sql` changes existing tables, so run it as their owner or a PostgreSQL administrator if `queuesmart_user` does not own them. If earlier SQL files have already been applied, run only the remaining files in order.

Set `DATABASE_URL` in `backend/.env` to `postgresql://queuesmart_user:YOUR_PASSWORD@localhost:5432/queuesmart`, replacing `YOUR_PASSWORD` with the password you chose. Do not commit `.env`. The API stores credentials in `UserCredentials`, profile details in `UserProfile`, organization services in `Service`, hashed reset tokens in `PasswordResetTokens`, queues in `Queue`, queue tickets in `QueueTickets`, and user notifications in `QueueNotifications`. The local Forgot Password flow displays a short-lived demo link on the page. Login sessions remain in memory, so users sign in again after the API restarts.

The API health endpoint is `GET /api/health`. Queue ticket responses also include the associated `queueEntry`, read from the `QueueEntry` view, with its queue ID, user ID, current position, join time, and status.

## Tests

From the `backend` directory:

```sh
npm ci
npm test
npm run test:coverage
```

The suite uses Node's built-in test runner and assertion library; no additional test dependencies are required. Unit tests cover authentication, password hashing, session expiry and revocation, role checks, request validation, services, queue progression, notifications, and error handling. Queue timing tests use a controlled clock instead of waiting in real time.

`tests/app.test.js` also exercises the real Express routes over a temporary loopback HTTP server, including login/logout, ownership, administrator permissions, password recovery validation, queue controls, serve-next, and CORS. Each test gets isolated in-memory repositories. Tests do not load `.env`, change development accounts, or contact external services. The test helper injects an isolated database boundary, so an inherited `DATABASE_URL` cannot accidentally select a real database.

SQL repository unit tests use scripted pool/client substitutes to check query parameters, result mapping, startup cache restoration, transaction ordering, commit/rollback, client release, password-reset hashing, and error propagation. These tests exercise the PostgreSQL code paths without requiring a running database. They do not execute the migration files or prove SQL syntax, constraints, locking, expiry, or persistence against a live PostgreSQL instance. Run migrations and database integration checks on a separate test database before relying on those guarantees.

Google token verification and SMTP transports are substituted in unit tests, covering valid/invalid identities, account reuse, email configuration, TLS settings, and delivery failures without contacting Google or sending email. Real Google/SMTP interoperability and browser behavior remain outside this suite.

The coverage command includes all JavaScript under `src/`, including server startup and database/environment configuration. Startup tests substitute the listener and dependencies and check initialization order and failures; they do not launch a production deployment. Coverage measures code execution across both unit and API integration tests, not proof that every scenario is correct. Use the current report rather than assuming a fixed percentage.

Service updates accept only `name`, `description`, `expectedDuration`, and `priorityLevel`; unsupported fields return `400`. Customers can leave their own waiting or serving tickets. Administrators can remove waiting or serving tickets. When a serving ticket leaves or is removed, the next ticket starts at that time.

## Structure

- `src/modules/auth/` — auth routes, controllers, validation, and role middleware
- `src/modules/services/` — service listing, creation, updates, validation, and repository
- `src/config/` — application configuration
- `src/middleware/` — shared error handling and request validation
- `src/app.js` — Express app configuration
- `src/server.js` — starts the HTTP server

Registration and email/password login use PostgreSQL-backed accounts. Passwords are hashed with bcrypt before storage. Registration assigns the `user` role; an administrator account can be bootstrapped by setting `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`. Login and registration return a Bearer token that expires after 24 hours. Use `GET /api/auth/me` with `Authorization: Bearer <token>` to read the signed-in account, and `POST /api/auth/logout` to revoke its session. Sessions remain in memory and reset when the server restarts. Only administrators can create, update, or delete services and list all tickets; joining a queue requires login, and users can leave only their own active ticket (waiting or serving).

### Google sign-in

Create a Google OAuth 2.0 **Web application** client in Google Cloud Console. Add `http://localhost:8000` and `http://127.0.0.1:8000` as authorized JavaScript origins. Put its client ID in `backend/.env` as `GOOGLE_CLIENT_ID=...` and in `frontend/js/config.js` as `googleClientId: "..."`. The client ID is public; never put a client secret in the frontend. Restart the backend and reload the frontend. QueueSmart verifies Google's ID token, creates a regular user account the first time, and reuses an existing account with the same verified email. Admin access is preserved only for accounts already assigned the admin role.

Password recovery uses `POST /api/auth/forgot-password` with an email and `POST /api/auth/reset-password` with a reset token and new password. Reset tokens are one-time and stored as hashes. In local demo mode, the Forgot Password page displays a reset link that expires after 30 seconds. Expired links immediately return the user to Forgot Password, and the reset page returns to sign-in after one minute without activity. Anyone using the demo page can see a link requested for an account, so this mode is not safe for real users and must not be used in production.

Service endpoints are `GET /api/services`, `POST /api/services`, and `PUT /api/services/:id`. Queue endpoints are `GET /api/queue/tickets`, `GET /api/queue/my-tickets`, `GET /api/queue/notifications`, `POST /api/queue/tickets`, and `DELETE /api/queue/tickets/:ticketId`. To join, send `serviceId`; the account name is used for the ticket. Queue tickets advance automatically according to each service’s expected duration: the current ticket becomes `served` and the next ticket becomes `serving`. Responses include the current position and a continuously decreasing wait estimate in seconds and minutes. Joining creates a notification, a one-time “almost up” notification is created when the estimated wait reaches five minutes or less, and the user gets a “It’s your turn” notification when service starts. The frontend checks for notifications and refreshes displayed wait estimates every five seconds. Authenticated users retrieve their notifications from `GET /api/queue/notifications`. Tickets and notifications are saved in PostgreSQL and restored after the API restarts. Leaving marks an active ticket as cancelled and moves the next ticket forward.

The service table starts with three demo services (General Inquiry, Billing & Payments, and Technical Support), so the user join form is populated immediately. Only administrators can create, update, or delete services. Expected service duration is expressed in minutes; service priority levels are `low`, `medium`, or `high`.

Administrators can open or close each service queue using `PATCH /api/queue/queues/:queueId` with `{ "status": "open" }` or `{ "status": "closed" }`. Closed queues remain visible but reject new tickets; tickets already waiting can still be served. `GET /api/queue/queues` lists queue IDs, service IDs, status, and creation times.
