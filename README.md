# QueueSmart

QueueSmart is a web app for signing in, joining service queues, tracking ticket status, and managing queues as an administrator. It uses a JavaScript frontend, a Node.js/Express backend, and PostgreSQL.

## Run the full app locally

You need Git, Node.js 22.13 or newer, PostgreSQL, and Python 3.

1. Clone the repository and open its folder:

   ```sh
   git clone https://github.com/Leventcure20/queuesmart.git
   cd queuesmart
   ```

2. Set up PostgreSQL, the backend environment, and the database tables by following the [backend setup instructions](backend/README.md#setup). The SQL migrations in `database/` create and seed the database. Set your local database password in `backend/.env`; do not commit that file.

3. In one terminal, start the backend:

   ```sh
   cd backend
   npm ci
   npm run dev
   ```

4. In a second terminal, from the repository folder, start the frontend:

   ```sh
   python3 -m http.server 8000 --directory frontend
   ```

5. Open <http://localhost:8000> in your browser. Keep both terminal windows open while using the app.

The local Google sign-in client ID is included in the frontend configuration. The backend also needs the matching `GOOGLE_CLIENT_ID` in `backend/.env`. See the backend guide for Google OAuth setup and administrator credentials.

## Tests

From the repository folder, run the backend unit and API tests with:

```sh
npm test --prefix backend
```

Coverage instructions and details about what the tests cover are in the [backend guide](backend/README.md#tests).
