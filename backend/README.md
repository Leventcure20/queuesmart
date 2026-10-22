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

Service endpoints are `GET /api/services`, `POST /api/services`, and `PUT /api/services/:id`. Queue endpoints are `GET /api/queue/tickets`, `GET /api/queue/my-tickets`, `GET /api/queue/notifications`, `POST /api/queue/tickets`, and `DELETE /api/queue/tickets/:ticketId`. To join, send `serviceId`; the account name is used for the ticket. Queue tickets advance automatically according to each service’s expected duration: the current ticket becomes `served` and the next ticket becomes `serving`. Responses include the current position and a continuously decreasing wait estimate in seconds and minutes. Joining creates a notification, a one-time “almost up” notification is created when the estimated wait reaches five minutes or less, and the user gets a “It’s your turn” notification when service starts. The frontend checks for notifications and refreshes displayed wait estimates every five seconds. Authenticated users retrieve their notification list from `GET /api/queue/notifications`; notifications and queue tickets are held in memory and reset when the server restarts. Leaving marks a waiting ticket as cancelled and moves the next ticket forward. Service records and queue tickets are held in memory and reset when the server restarts.

The in-memory service repository starts with three demo services (General Inquiry, Billing & Payments, and Technical Support), so the user join form is populated immediately. Admin changes and newly created services are available until the backend restarts. Expected service duration is expressed in minutes; service priority levels are `low`, `medium`, or `high`.
