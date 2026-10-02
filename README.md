# QueueSmart

QueueSmart is a frontend demo built with HTML, CSS, and JavaScript. It has no package installation step.

## Run the project on your computer

1. Install **Git** and **Python 3** if they are not already installed.
2. Open Terminal (macOS/Linux) or Command Prompt/PowerShell (Windows).
3. Clone the team's GitHub repository:

   ```bash
   git clone https://github.com/Leventcure20/queuesmart.git
   ```

4. Go into the downloaded project folder. If the folder is named `queuesmart`, run:

   ```bash
   cd queuesmart
   ```

5. Start the local web server:

   ```bash
   python3 -m http.server 8000 --directory frontend
   ```

   On Windows, if `python3` is not recognized, try:

   ```powershell
   py -m http.server 8000 --directory frontend
   ```

6. Leave the terminal window open and visit **http://localhost:8000/** in your web browser. This opens the QueueSmart home page.
7. To stop the server, return to the terminal and press **Ctrl+C**.

## Main screens

- `index.html` — public home page
- `dashboard.html` — customer dashboard
- `join-queue.html` — join a queue
- `queue-status.html` — view ticket status
- `login.html` and `register.html` — authentication UI
- `admin-dashboard.html` — administrator dashboard
- `service-management.html` — manage services
- `queue-management.html` — manage the queue
- `history.html` — queue history

The app uses mock data and frontend-only interactions. Login, registration, and Google sign-in are UI placeholders; real authentication requires backend support.
