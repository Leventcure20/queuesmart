# QueueSmart frontend

This is a plain HTML, CSS, and JavaScript frontend with mock queue data. From the project folder, run `python3 -m http.server 8000 --directory frontend` and open `http://localhost:8000/dashboard.html`.

## Google sign-in setup

The login and registration screens use Google Identity Services when configured. Set `googleClientId` in `frontend/js/config.js` to a Google OAuth 2.0 **Web application client ID**, then add the local origin you use (for example, `http://localhost:8000`) as an authorized JavaScript origin in Google Cloud Console.

Set `googleAuthEndpoint` in the same config to your backend route for Google sign-in. That route must verify the Google ID token and establish the app session before returning success. The current repository contains no backend route, so Google sign-in displays a setup message until the client ID is set and cannot complete authentication until the backend endpoint is implemented. Do not put a client secret in frontend files.
