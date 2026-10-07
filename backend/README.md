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

Registration and login currently return `501 Not Implemented`: persistence, password hashing, and token strategy have not been selected yet. Google login is an intentionally empty placeholder.

Service endpoints are `GET /api/services`, `POST /api/services`, and `PUT /api/services/:id`. Service records are currently held in memory and reset when the server restarts. Expected duration is expressed in minutes; priority levels are `low`, `medium`, or `high`.
