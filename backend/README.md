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

For a new database, run all five checked-in SQL files in order. They create `UserCredentials`, `UserProfile`, `Service`, and password-reset token storage, then insert the three demo services:

```sh
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/001_create_user_credentials.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/002_create_user_profile.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/003_create_service.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/004_seed_services.sql
psql -h localhost -U queuesmart_user -d queuesmart -f ../database/005_create_password_reset_tokens.sql
```

If earlier SQL files have already been applied, run only the remaining files in order.

Set `DATABASE_URL` in `backend/.env` to `postgresql://queuesmart_user:YOUR_PASSWORD@localhost:5432/queuesmart`, replacing `YOUR_PASSWORD` with the password you chose. Do not commit `.env`. The API stores credentials in `UserCredentials`, profile details in `UserProfile`, organization services in `Service`, and only hashed, one-time reset tokens in `PasswordResetTokens`. Local development prints reset links in the backend terminal. Sessions, queue tickets, and notifications are still held in memory and reset when the API restarts.

The API health endpoint is `GET /api/health`.

## Tests

From the `backend` directory:

```sh
npm ci
npm test
npm run test:coverage
```

The suite uses Node's built-in test runner and assertion library; no additional test dependencies are required. Unit tests cover authentication, password hashing, session expiry and revocation, role checks, request validation, services, queue progression, notifications, and error handling. Queue timing tests use a controlled clock instead of waiting in real time.

`tests/app.test.js` also exercises the real Express routes over a temporary loopback HTTP server, including login/logout, ownership, administrator permissions, validation, and CORS. Each test gets isolated in-memory repositories. Tests do not load `.env`, change development accounts, or contact external services.

The coverage command includes `src/app.js`, middleware, and all API modules. It excludes `src/server.js` and `src/config/`, which start the server and load environment configuration. Google sign-in is tested for its current `501 Not Implemented` response. Database persistence, external Google authentication, browser behavior, and deployment configuration remain outside this suite.

Service updates accept only `name`, `description`, `expectedDuration`, and `priorityLevel`; unsupported fields return `400`. Customers can leave their own waiting or serving tickets. Administrators can remove waiting or serving tickets. When a serving ticket leaves or is removed, the next ticket starts at that time.

## Structure

- `src/modules/auth/` — auth routes, controllers, validation, and role middleware
- `src/modules/services/` — service listing, creation, updates, validation, and repository
- `src/config/` — application configuration
- `src/middleware/` — shared error handling and request validation
- `src/app.js` — Express app configuration
- `src/server.js` — starts the HTTP server

Registration and email/password login use PostgreSQL-backed accounts. Passwords are hashed with bcrypt before storage. Registration assigns the `user` role; an administrator account can be bootstrapped by setting `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`. Login and registration return a Bearer token that expires after 24 hours. Use `GET /api/auth/me` with `Authorization: Bearer <token>` to read the signed-in account, and `POST /api/auth/logout` to revoke its session. Sessions remain in memory and reset when the server restarts. Only administrators can create, update, or delete services and list all tickets; joining a queue requires login, and users can leave only their own active ticket (waiting or serving). Google login remains a placeholder.

Password recovery uses `POST /api/auth/forgot-password` with an email and `POST /api/auth/reset-password` with a reset token and new password. The forgot-password response is the same whether or not the email is registered. Reset tokens are one-time, expire after 15 minutes, and are stored as hashes. In local development, the reset link is printed in the backend terminal; this project does not send email.

Service endpoints are `GET /api/services`, `POST /api/services`, and `PUT /api/services/:id`. Queue endpoints are `GET /api/queue/tickets`, `GET /api/queue/my-tickets`, `GET /api/queue/notifications`, `POST /api/queue/tickets`, and `DELETE /api/queue/tickets/:ticketId`. To join, send `serviceId`; the account name is used for the ticket. Queue tickets advance automatically according to each service’s expected duration: the current ticket becomes `served` and the next ticket becomes `serving`. Responses include the current position and a continuously decreasing wait estimate in seconds and minutes. Joining creates a notification, a one-time “almost up” notification is created when the estimated wait reaches five minutes or less, and the user gets a “It’s your turn” notification when service starts. The frontend checks for notifications and refreshes displayed wait estimates every five seconds. Authenticated users retrieve their notification list from `GET /api/queue/notifications`; notifications and queue tickets are held in memory and reset when the server restarts. Leaving marks an active ticket as cancelled and moves the next ticket forward. Service records and queue tickets are held in memory and reset when the server restarts.

The service table starts with three demo services (General Inquiry, Billing & Payments, and Technical Support), so the user join form is populated immediately. Only administrators can create, update, or delete services. Expected service duration is expressed in minutes; service priority levels are `low`, `medium`, or `high`.
