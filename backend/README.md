# QueueSmart backend

Node.js and Express API scaffold for QueueSmart. The frontend is currently a demo with mock data; this directory establishes the backend structure for authentication and later queue features.

## Setup

```sh
npm install
cp .env.example .env
npm run dev
```

The API health endpoint is `GET /api/health`.

## Structure

- `src/modules/auth/` — auth routes, controllers, validation, and role middleware
- `src/modules/services/` — service listing, creation, updates, validation, and repository
- `src/config/` — application configuration
- `src/middleware/` — shared error handling and request validation
- `src/app.js` — Express app configuration
- `src/server.js` — starts the HTTP server

Registration and email/password login work with temporary in-memory accounts. Passwords are hashed with bcrypt. Registration assigns the `user` role; an administrator account can be bootstrapped by setting `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`. Login and registration return a Bearer token that expires after 24 hours. Use `GET /api/auth/me` with `Authorization: Bearer <token>` to read the signed-in account, and `POST /api/auth/logout` to revoke its session. Service creation/updates and ticket listing require the admin role; joining a queue requires login, and users can leave only their own waiting ticket. Google login remains a placeholder. Accounts and sessions reset when the server restarts; database storage is not implemented.

Service endpoints are `GET /api/services`, `POST /api/services`, and `PUT /api/services/:id`. Queue endpoints are `GET /api/queue/tickets`, `POST /api/queue/tickets`, and `DELETE /api/queue/tickets/:ticketId`. To join, send `serviceId`; the account name is used for the ticket. Leaving marks a waiting ticket as cancelled. Service records and queue tickets are held in memory and reset when the server restarts.

Expected service duration is expressed in minutes; service priority levels are `low`, `medium`, or `high`.
