(async () => {
  const path = location.pathname.split("/").pop() || "index.html";
  const data = window.QueueSmartData;
  const isPublic = ["index.html", "login.html", "register.html"].includes(path);
  const adminOnlyPage =
    [
      "admin-dashboard.html",
      "service-management.html",
      "queue-management.html",
    ].includes(path) ||
    (path === "history.html" &&
      new URLSearchParams(location.search).get("role") === "admin");
  const authStorageKey = "QueueSmartAuth";
  let authSession = null;
  try {
    authSession = JSON.parse(localStorage.getItem(authStorageKey) || "null");
  } catch {
    localStorage.removeItem(authStorageKey);
  }
  if (!isPublic) {
    if (
      !authSession?.token ||
      !authSession.expiresAt ||
      Date.parse(authSession.expiresAt) <= Date.now()
    ) {
      localStorage.removeItem(authStorageKey);
      location.replace(
        "login.html?returnTo=" + encodeURIComponent(path + location.search),
      );
      return;
    }
    try {
      authSession.user = await window.QueueSmartApi.getCurrentUser();
      localStorage.setItem(authStorageKey, JSON.stringify(authSession));
    } catch {
      localStorage.removeItem(authStorageKey);
      location.replace(
        "login.html?returnTo=" + encodeURIComponent(path + location.search),
      );
      return;
    }
    if (adminOnlyPage && authSession.user.role !== "admin") {
      location.replace("dashboard.html");
      return;
    }
    if (path === "dashboard.html" && authSession.user.role === "admin") {
      location.replace("admin-dashboard.html");
      return;
    }
    try {
      [data.services, data.tickets] = await Promise.all([
        window.QueueSmartApi.getServices(),
        window.QueueSmartApi.getTickets(),
      ]);
      data.stats = {
        servedToday: data.tickets.filter((t) => t.status === "Completed")
          .length,
        averageWait: data.tickets.filter((t) => t.estimatedWaitMinutes != null)
          .length
          ? Math.round(
              data.tickets
                .filter((t) => t.estimatedWaitMinutes != null)
                .reduce((sum, t) => sum + t.estimatedWaitMinutes, 0) /
                data.tickets.filter((t) => t.estimatedWaitMinutes != null)
                  .length,
            )
          : 0,
      };
    } catch (error) {
      const shell = document.querySelector("[data-app-shell]");
      if (shell)
        shell.innerHTML = `<main class="page-content"><section class="form-card"><h1>Backend unavailable</h1><p>${error.message}</p><a class="button button-secondary" href="login.html">Sign in again</a></section></main>`;
      return;
    }
  }
  const signedInUser = authSession?.user;
  const displayName = signedInUser?.name || data.currentUser.name;
  const firstName = displayName.trim().split(/\s+/)[0];
  const userInitials = displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (signedInUser) {
    data.currentUser = {
      ...data.currentUser,
      ...signedInUser,
      initials: userInitials,
    };
  }
  document.body.classList.toggle("public-page", isPublic);
  const isLanding = path === "index.html";
  document.body.classList.toggle("landing-page", isLanding);
  document.body.classList.toggle(
    "admin-dashboard-page",
    path === "admin-dashboard.html",
  );
  document.body.classList.toggle(
    "centered-page-title",
    [
      "service-management.html",
      "queue-management.html",
      "history.html",
      "queue-status.html",
      "dashboard.html",
    ].includes(path),
  );
  const isAuthForm = path === "login.html" || path === "register.html";
  const hasCenteredHeader = isAuthForm || path === "join-queue.html";
  document.body.classList.toggle("auth-page", hasCenteredHeader);
  const admin =
    path === "admin-dashboard.html" ||
    path === "service-management.html" ||
    path === "queue-management.html" ||
    (path === "history.html" &&
      new URLSearchParams(location.search).get("role") === "admin");
  const nav = admin
    ? [
        ["admin-dashboard.html", "Admin dashboard", "⌂"],
        ["service-management.html", "Services", "◇"],
        ["queue-management.html", "Queue management", "≡"],
        ["history.html?role=admin", "History", "◷"],
      ]
    : [
        ["dashboard.html", "My dashboard", "⌂"],
        ["join-queue.html", "Join a queue", "＋"],
        ["queue-status.html", "Queue status", "◉"],
        ["history.html", "History", "◷"],
      ];
  const defaultTitles = {
    "index.html": "QueueSmart",
    "dashboard.html": "My dashboard",
    "admin-dashboard.html": "Admin dashboard",
    "queue-management.html": "Queue management",
    "service-management.html": "Service management",
    "history.html": "Queue history",
    "join-queue.html": "Join a queue",
    "queue-status.html": "Queue status",
    "login.html": "Sign in",
    "register.html": "Create account",
  };
  const title =
    document.body.dataset.title || defaultTitles[path] || "QueueSmart";
  const app = document.querySelector("[data-app-shell]");
  if (!app) return;
  const savedTheme = localStorage.getItem("QueueSmartTheme");
  document.body.dataset.theme = savedTheme === "dark" ? "dark" : "light";
  const brandLink = `<a class="landing-brand" href="index.html"><span class="brand-mark">Q</span><span>Queue<span class="brand-light">Smart</span></span></a>`;
  const publicLinks =
    path === "index.html"
      ? [
          ["Join a queue", "join-queue.html"],
          ["Sign in", "login.html"],
          ["Create account", "register.html"],
        ]
      : path === "login.html"
        ? [
            ["Home", "index.html"],
            ["Join a queue", "join-queue.html"],
            ["Create account", "register.html"],
          ]
        : path === "register.html"
          ? [
              ["Home", "index.html"],
              ["Join a queue", "join-queue.html"],
              ["Sign in", "login.html"],
            ]
          : path === "join-queue.html"
            ? [
                ["Home", "index.html"],
                ["Sign in", "login.html"],
                ["Create account", "register.html"],
              ]
            : [
                ["Home", "index.html"],
                ["Join another queue", "join-queue.html"],
                ["Sign in", "login.html"],
              ];
  const publicNavigation = `${brandLink}<nav class="landing-nav">${publicLinks.map(([label, href]) => `<a ${label === "Create account" && path === "index.html" ? 'class="button button-primary"' : ""} href="${href}">${label}</a>`).join("")}</nav>${hasCenteredHeader ? `<div class="auth-header-copy"><div class="eyebrow">QUEUESMART · CUSTOMER PORTAL</div><h1>${title}</h1></div>` : ""}`;
  const topbar = isPublic
    ? publicNavigation
    : `<button class="mobile-nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false">☰</button><a class="mobile-brand" href="${admin ? "admin-dashboard.html" : "dashboard.html"}"><span class="brand-mark">Q</span> QueueSmart</a><div class="breadcrumbs">${admin ? "Administration" : "My workspace"} <span>/</span> <strong>${title}</strong></div><div class="top-actions"><span class="live-indicator"><i></i> Live backend</span><button class="icon-button" id="theme-toggle" type="button" aria-label="Toggle theme">◐</button><button class="icon-button" aria-label="Notifications" data-action="toggle-notifications" aria-expanded="false">♧<b></b></button><span class="avatar small-avatar">${userInitials}</span><a class="signout-button" href="login.html" data-action="logout">Sign out</a></div>`;
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="${admin ? "admin-dashboard.html" : "dashboard.html"}"><span class="brand-mark">Q</span><span>Queue<span class="brand-light">Smart</span></span></a><button class="sidebar-toggle" type="button" aria-label="Collapse sidebar" aria-expanded="true"><span>‹</span></button><div class="side-label">${admin ? "ADMINISTRATION" : "YOUR QUEUES"}</div><nav>${nav.map(([href, label, icon]) => `<a class="nav-link ${path === href.split("?")[0] ? "active" : ""}" href="${href}"><span class="nav-icon">${icon}</span>${label}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="help-card"><span class="help-icon">?</span><strong>Need a hand?</strong><p>Get help with your workspace.</p><a href="#" data-toast="The help center is unavailable in this preview.">Visit help center →</a></div><a class="profile" href="login.html"><span class="avatar">${userInitials}</span><span><strong>${displayName}</strong><small>${admin ? "Administrator" : "QueueSmart user"}</small></span><span class="profile-more">···</span></a></div></aside><div class="sidebar-backdrop" data-close-sidebar></div><main class="main"><header class="topbar">${topbar}</header><section class="page-content"><div class="page-heading"><div><div class="eyebrow">${admin ? "QUEUESMART · ADMIN PORTAL" : "QUEUESMART · USER DASHBOARD"}</div><h1>${title}</h1><p>${document.body.dataset.subtitle || "Manage your queues and services."}</p></div><div class="heading-actions"></div></div><div id="page-content"></div></section></main><div class="toast" role="status" aria-live="polite"></div>`;
  const root = document.querySelector("#page-content");
  const todayDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  const badge = (status, ticketId = null) =>
    `<span${ticketId ? ` data-ticket-status="${ticketId}"` : ""} class="badge ${status.toLowerCase()}"><i></i>${status}</span>`;
  const tickets = (history = false) =>
    data.tickets
      .map((ticket, index) => ({ ticket, index }))
      .filter(({ ticket }) =>
        history
          ? !["Waiting", "Serving"].includes(ticket.status)
          : ["Waiting", "Serving"].includes(ticket.status),
      )
      .map(
        ({ ticket: t, index: i }) =>
          `<tr data-ticket-row="${t.id}"><td><strong class="ticket-id">${t.number}</strong></td><td>${t.customer}</td><td>${t.service}</td><td class="muted">${history ? `${t.joinedDate || todayDate} · ` : ""}${t.joined}${!history ? ` · ${t.wait} wait` : ""}</td><td>${badge(history ? t.outcome || t.status : t.status, t.id)}</td>${admin && !history ? `<td class="row-actions"><button class="mini-button" data-action="remove" data-ticket-id="${t.id}" aria-label="Cancel ticket">×</button></td>` : ""}</tr>`,
      )
      .join("");
  const table = (actions = false) =>
    `<div class="panel"><div class="panel-heading"><div><h2>${actions ? "Selected service queue" : "Queue history"}</h2><p>${actions ? "Live tickets currently in the queue." : "Completed visits and other past outcomes"}</p></div>${actions ? `<select id="service-filter" aria-label="Filter by service"><option value="">All services</option>${data.services.map((s) => `<option>${s.name}</option>`).join("")}</select>` : ""}</div><div class="table-wrap"><table class="${actions ? "" : "history-table"}"${actions ? ' data-live-queue="true"' : ""}><thead><tr><th>TICKET</th><th>CUSTOMER</th><th>SERVICE</th><th>${actions ? "JOINED · ESTIMATED WAIT" : "DATE & TIME"}</th><th>STATUS</th>${actions ? "<th>ACTIONS</th>" : ""}</tr></thead><tbody>${tickets(!actions) || '<tr><td colspan="5" class="muted">No past queue visits yet.</td></tr>'}</tbody></table></div></div>`;

  const serveNextControls = () => `
  <div class="panel" style="padding:16px;margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
    <label for="serve-service">Service to advance</label>
    <select id="serve-service">
      ${data.services
        .map((s) => `<option value="${s.id}">${s.name}</option>`)
        .join("")}
    </select>
    <button
      class="button button-primary"
      data-action="serve-next"
    >
      Serve next user →
    </button>
  </div>`;
  const notificationList = () =>
    `<div class="panel notification-list" id="notifications-panel" hidden><div class="panel-heading"><div><h2>Notifications</h2><p>Queue confirmations and reminders</p></div></div><div id="notification-items"><p class="muted">No notifications yet.</p></div></div>`;
  const renderNotifications = (notifications) => {
    const list = document.querySelector("#notification-items");
    if (!list) return;
    list.replaceChildren();
    if (!notifications.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No notifications yet.";
      list.append(empty);
      return;
    }
    notifications.forEach((item) => {
      const row = document.createElement("article");
      row.className = "notification-row";
      const icon = document.createElement("span");
      icon.className =
        "notification-type " +
        (item.type === "almost_ready" ? "wait" : "status");
      icon.textContent = item.type === "almost_ready" ? "◷" : "✓";
      const copy = document.createElement("span");
      copy.className = "notification-copy";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const message = document.createElement("small");
      message.textContent = item.message;
      copy.append(title, message);
      const time = document.createElement("time");
      time.textContent = new Date(item.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      row.append(icon, copy, time);
      list.append(row);
    });
  };
  const serviceList = (manage = false, allowActions = manage) =>
    `<div class="service-grid">${data.services
      .map((s, i) => {
        const waiting = data.tickets.filter(
          (t) =>
            t.service === s.name && ["Waiting", "Serving"].includes(t.status),
        ).length;
        return `<article class="service-card"><div class="service-card-top"><span class="service-symbol symbol-${i % 3}">${["◈", "＄", "⌘"][i % 3]}</span>${badge("Open")}</div><h3>${s.name}</h3><p>${s.description}</p>${manage ? `<p class="service-priority">Priority: <strong>${(s.priority || "medium").charAt(0).toUpperCase() + (s.priority || "medium").slice(1)}</strong></p>` : ""}<div class="service-metrics"><span><strong>${s.duration} min</strong><small>Expected duration</small></span><span><strong>${waiting} people</strong><small>In this queue</small></span></div>${allowActions ? `<div class="card-actions"><button class="button button-secondary" data-action="edit-service" data-index="${i}">Edit</button><button class="button button-secondary" data-action="delete-service" data-service-id="${s.id}">Delete</button></div>` : manage ? "" : `<a class="button button-primary full-width" href="join-queue.html?service=${encodeURIComponent(s.id)}">Join queue →</a>`}</article>`;
      })
      .join(
        "",
      )}${manage ? "" : '<a class="add-service" href="join-queue.html"><span>＋</span><strong>Choose a service</strong><small>See all available queues</small></a>'}</div>`;
  const adminUsageStats = () =>
    `<section class="admin-usage-block" aria-labelledby="usage-heading"><h2 id="usage-heading">Today at a glance</h2><div class="admin-usage-stats" aria-label="Usage statistics"><article class="admin-stat-card"><span class="admin-stat-icon purple">↗</span><div><small>Completed tickets</small><strong>${data.stats.servedToday}</strong></div></article><article class="admin-stat-card"><span class="admin-stat-icon blue">◷</span><div><small>Average wait time</small><strong>${data.stats.averageWait} <span>min</span></strong></div></article><article class="admin-stat-card"><span class="admin-stat-icon green">◇</span><div><small>Open services</small><strong>${data.services.filter((service) => service.status === "Open").length} <span>of ${data.services.length}</span></strong></div></article></div></section>`;
  const renderLiveAdminView = () => {
    const search = document.querySelector("#ticket-search")?.value || "";
    const selectedService =
      document.querySelector("#service-filter")?.value || "";
    if (path === "admin-dashboard.html") {
      root.innerHTML = `${adminUsageStats()}<div class="section-intro"><div><h2>Service queues</h2><p>Current queue lengths and availability.</p></div><a class="button button-secondary" href="service-management.html">Manage services →</a></div>${serviceList(true, false)}${serveNextControls()}${table(true)}`;
    } else if (path === "queue-management.html") {
      root.innerHTML = `<div class="toolbar"><div class="tabs"><span class="tab active">Live queue</span></div><label class="search-box">⌕ <input id="ticket-search" placeholder="Search tickets..."></label></div>${serveNextControls()}${table(true)}`;
    } else return;
    const searchInput = document.querySelector("#ticket-search");
    const serviceFilter = document.querySelector("#service-filter");
    if (searchInput) searchInput.value = search;
    if (serviceFilter) serviceFilter.value = selectedService;
    const query = search.trim().toLowerCase();
    root.querySelectorAll("tbody tr").forEach((row) => {
      const rowService = row.cells[2]?.textContent.trim() || "";
      row.hidden =
        !row.textContent.toLowerCase().includes(query) ||
        (selectedService && rowService !== selectedService);
    });
  };
  let markup = "";
  if (path === "index.html")
    markup = `<section class="landing-hero"><div class="landing-copy"><div class="landing-kicker"><span></span> QUEUE MANAGEMENT, MADE SIMPLE</div><h2>Your place in line,<br><em>without waiting in one.</em></h2><p>Join a queue, see your estimated wait, and know when it’s nearly your turn—all from one simple place.</p><div class="landing-ctas"><a class="button button-primary" href="join-queue.html">Join a queue <span>→</span></a><a class="landing-secondary" href="register.html">Create an account</a></div><div class="landing-note"><span class="avatar-stack"><i>Q</i><i>✓</i></span><span>Simple updates, less time wondering.</span></div></div><div class="landing-preview"><div class="preview-glow"></div><div class="preview-card"><div class="preview-top"><span class="preview-label"><i></i> QUEUE PREVIEW</span><span class="preview-menu">···</span></div><div class="preview-service"><span class="service-symbol symbol-0">◈</span><span><strong>General Inquiry</strong><small>Service queue</small></span></div><div class="preview-ticket"><span>Your ticket</span><strong>A024</strong></div><div class="preview-position"><div><strong>4<small>th</small></strong><span>in line</span></div><div><strong>~12<small> min</small></strong><span>estimated wait</span></div></div><div class="preview-progress"><span></span></div><div class="preview-update"><span>✓</span><span><strong>You’re in the queue</strong><small>We’ll let you know when you’re almost up.</small></span></div><div class="preview-watermark">A sample of your queue status</div></div><div class="preview-orbit orbit-one"></div><div class="preview-orbit orbit-two"></div></div></section><section class="landing-features"><div class="landing-section-heading"><div class="eyebrow">A BETTER WAY TO WAIT</div><h2>Know what’s happening in line.</h2></div><div class="feature-grid"><article class="feature-card"><span class="feature-icon purple">◷</span><h3>See your wait</h3><p>Check your place and estimated wait before you plan your next step.</p></article><article class="feature-card"><span class="feature-icon blue">↗</span><h3>Keep your place</h3><p>Join a service queue and follow your ticket from your device.</p></article><article class="feature-card"><span class="feature-icon green">✓</span><h3>Know when you’re close</h3><p>Get a clear status update as your turn gets closer.</p></article></div></section><section class="landing-bottom"><div><h2>Ready to get started?</h2><p>Join a queue or create an account to keep track of your visits.</p></div><a class="button button-primary" href="join-queue.html">Get started <span>→</span></a></section><footer class="landing-footer"><a href="index.html">QueueSmart</a><span>Queue management made simpler.</span><a href="admin-dashboard.html">Administrator access</a></footer>`;
  else if (path === "login.html" || path === "register.html")
    markup = `<div class="form-card auth-form-card"><h2>${path === "login.html" ? "Welcome back" : "Create your account"}</h2><p>${path === "login.html" ? "Sign in to manage your queues." : "Register to join and track queues."}</p><form id="auth-form" novalidate>${path === "register.html" ? '<label>Full name<input name="name" autocomplete="name" required maxlength="100"></label>' : ""}<label>Email<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><div class="form-message" aria-live="polite"></div><button class="button button-primary full-width">${path === "login.html" ? "Sign in" : "Create account"} →</button></form><div class="auth-divider"><span>or continue with</span></div><button type="button" id="google-signin-fallback" class="google-fallback"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.92c-.58 2.96-2.26 5.48-4.74 7.18l7.3 5.66c4.27-3.94 6.73-9.74 6.73-17.31z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.79l-7.3-5.66c-2.02 1.35-4.6 2.15-8.6 2.15-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 43.62 14.62 48 24 48z"/></svg><span>Continue with Google</span></button><div id="google-signin-button"></div><div class="form-switch">${path === "login.html" ? 'New to QueueSmart? <a href="register.html">Create an account</a>' : 'Already registered? <a href="login.html">Sign in</a>'}</div></div>`;
  else if (path === "join-queue.html")
    markup = `<div class="form-card"><p>Joining as ${displayName}. Choose a service to save your place.</p><form id="join-form" novalidate><label>Service<select name="service" required><option value="">Select a service</option>${data.services
      .map(
        (s) =>
          `<option value="${s.id}">${s.name} · about ${s.duration} min per person</option>`,
      )
      .join(
        "",
      )}</select></label><div class="wait-preview" id="wait-preview">Select a service to see the estimated wait.</div><div class="form-message" aria-live="polite"></div><button class="button button-primary full-width">Join queue →</button></form></div>`;
  else if (path === "queue-status.html") {
    const savedTicket = JSON.parse(
      sessionStorage.getItem("queueTicket") || "null",
    );
    const current =
      (savedTicket && data.tickets.find((t) => t.id === savedTicket.id)) ||
      data.tickets.find((t) => ["Waiting", "Serving"].includes(t.status));
    if (!current) {
      markup = `<div class="status-card"><h2>You have no active queue ticket</h2><p>Join a service queue to see your live position and estimated wait.</p><a class="button button-primary full-width" href="join-queue.html">Browse services</a></div>`;
    } else {
      const position = current.position == null ? "—" : current.position;
      markup = `<div class="status-card"><span class="status-check">✓</span><div class="eyebrow">LIVE QUEUE UPDATE</div><h2>Ticket <span class="ticket-id">${current.number}</span></h2><p>You’re in line for ${current.service}.</p><div class="wait-highlight"><strong data-ticket-wait="${current.id}">~${current.wait}</strong><span>Estimated wait time</span></div><div class="queue-position"><span>Your ticket status</span><strong data-ticket-status="${current.id}">${current.status}</strong></div><div class="queue-position"><span>Your position in line</span><strong data-ticket-position="${current.id}" data-ticket-position-format="label">${position}</strong></div><div class="queue-position"><span>People ahead of you</span><strong data-ticket-ahead="${current.id}">${current.position == null ? "—" : Math.max(0, current.position - 1)}</strong></div><button class="button button-danger full-width" data-action="leave-queue" data-ticket-id="${current.id}">Leave queue</button></div>`;
    }
  } else if (path === "service-management.html")
    markup = `<div class="section-intro"><div><h2>Active services</h2><p>Create, update, and open or close queues.</p></div><button class="button button-primary" data-action="new-service">＋ Add service</button></div><div id="service-form-slot"></div>${serviceList(true)}`;
  else if (path === "queue-management.html")
    markup = `<div class="toolbar"><div class="tabs"><span class="tab active">Live queue</span></div><label class="search-box">⌕ <input id="ticket-search" placeholder="Search tickets..." aria-label="Search tickets"></label></div>${serveNextControls()}${table(true)}`;
  else if (path === "history.html") markup = table(false);
  else if (path === "admin-dashboard.html")
    markup = `${adminUsageStats()}<div class="section-intro"><div><h2>Service queues</h2><p>Current queue lengths and availability.</p></div><a class="button button-secondary" href="service-management.html">Manage services →</a></div>${serviceList(true, false)}${serveNextControls()}${table(true)}`;
  else {
    const current = data.tickets.find((t) =>
      ["Waiting", "Serving"].includes(t.status),
    );
    markup = `<div class="user-welcome"><div><h2>Welcome back, ${firstName}</h2><p>Here’s your queue activity today.</p></div><a class="button button-primary" href="join-queue.html">＋ Join a queue</a></div>${current ? `<div class="current-queue-card"><div class="panel-heading"><div><div class="eyebrow">CURRENT QUEUE</div><h2>${current.service}</h2><p>Ticket ${current.number}</p></div>${badge(current.status, current.id)}</div><div class="current-queue-stats"><div><strong data-ticket-position="${current.id}" data-ticket-position-format="number">#${current.position ?? "—"}</strong><span>Position in line</span></div><div><strong data-ticket-wait="${current.id}">~${current.wait}</strong><span>Estimated wait</span></div><div><strong>${current.number}</strong><span>Ticket Number</span></div><a class="button button-primary" href="queue-status.html">View Status →</a></div></div>` : `<div class="current-queue-card"><h2>No active queue</h2><p>Join a service to see your ticket and wait estimate here.</p></div>`}<div class="section-intro"><div><h2>Available services</h2><p>Join a service queue and track your wait.</p></div></div>${serviceList(false)}<div class="panel recent-history"><div class="panel-heading"><div><h2>Your recent queues</h2><p>Past and current visits</p></div><a href="history.html" class="text-link">View history →</a></div><div class="table-wrap"><table><thead><tr><th>TICKET</th><th>SERVICE</th><th>JOINED</th><th>STATUS</th></tr></thead><tbody>${
      data.tickets
        .slice(0, 3)
        .map(
          (t) =>
            `<tr><td class="ticket-id">${t.number}</td><td>${t.service}</td><td>${t.joined}</td><td>${badge(t.status)}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="4" class="muted">No queue visits yet.</td></tr>'
    }</tbody></table></div></div>`;
  }
  if (!isPublic)
    document
      .querySelector(".topbar")
      .insertAdjacentHTML("afterend", notificationList());
  root.innerHTML = markup;
  const themeToggle = document.querySelector("#theme-toggle");
  const updateThemeToggle = () => {
    const isDark = document.body.dataset.theme === "dark";
    themeToggle?.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode",
    );
    themeToggle?.setAttribute("aria-pressed", String(isDark));
  };
  updateThemeToggle();
  themeToggle?.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = nextTheme;
    localStorage.setItem("QueueSmartTheme", nextTheme);
    updateThemeToggle();
  });
  const sidebarToggle = document.querySelector(".sidebar-toggle");
  const mobileNavToggle = document.querySelector(".mobile-nav-toggle");
  const setMobileNav = (open) => {
    document.body.classList.toggle("mobile-nav-open", open);
    mobileNavToggle?.setAttribute("aria-expanded", String(open));
    mobileNavToggle?.setAttribute(
      "aria-label",
      open ? "Close navigation" : "Open navigation",
    );
  };
  if (
    !isPublic &&
    window.innerWidth > 700 &&
    localStorage.getItem("QueueSmartSidebarCollapsed") === "true"
  )
    document.body.classList.add("sidebar-collapsed");
  sidebarToggle?.setAttribute(
    "aria-expanded",
    String(!document.body.classList.contains("sidebar-collapsed")),
  );
  sidebarToggle?.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("sidebar-collapsed");
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.setAttribute(
      "aria-label",
      collapsed ? "Expand sidebar" : "Collapse sidebar",
    );
    localStorage.setItem("QueueSmartSidebarCollapsed", String(collapsed));
  });
  mobileNavToggle?.addEventListener("click", () =>
    setMobileNav(!document.body.classList.contains("mobile-nav-open")),
  );
  document
    .querySelector(".sidebar-backdrop")
    ?.addEventListener("click", () => setMobileNav(false));
  document
    .querySelectorAll(".sidebar .nav-link")
    .forEach((link) =>
      link.addEventListener("click", () => setMobileNav(false)),
    );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMobileNav(false);
  });
  const toast = (message) => {
    const box = document.querySelector(".toast");
    box.textContent = message;
    box.classList.add("show");
    clearTimeout(window.queueToastTimer);
    window.queueToastTimer = setTimeout(
      () => box.classList.remove("show"),
      2500,
    );
  };
  if (!isPublic && signedInUser?.id) {
    const seenKey = "QueueSmartSeenNotifications:" + signedInUser.id;
    let seen = new Set();
    try {
      seen = new Set(JSON.parse(localStorage.getItem(seenKey) || "[]"));
    } catch {}
    const pollNotifications = async () => {
      try {
        const [notifications, tickets, services] = await Promise.all([
          window.QueueSmartApi.getNotifications(),
          window.QueueSmartApi.getTickets(),
          window.QueueSmartApi.getServices(),
        ]);
        data.tickets = tickets;
        data.services = services;
        data.stats = {
          servedToday: tickets.filter((ticket) => ticket.status === "Completed")
            .length,
          averageWait: tickets.filter(
            (ticket) => ticket.estimatedWaitMinutes != null,
          ).length
            ? Math.round(
                tickets
                  .filter((ticket) => ticket.estimatedWaitMinutes != null)
                  .reduce(
                    (sum, ticket) => sum + ticket.estimatedWaitMinutes,
                    0,
                  ) /
                  tickets.filter(
                    (ticket) => ticket.estimatedWaitMinutes != null,
                  ).length,
              )
            : 0,
        };
        if (admin) renderLiveAdminView();
        renderNotifications(notifications);
        tickets.forEach((ticket) => {
          const waitElement = document.querySelector(
            `[data-ticket-wait="${ticket.id}"]`,
          );
          if (waitElement) waitElement.textContent = `~${ticket.wait}`;
          const statusElement = document.querySelector(
            `[data-ticket-status="${ticket.id}"]`,
          );
          if (statusElement) {
            statusElement.textContent = ticket.status;
            if (statusElement.classList.contains("badge"))
              statusElement.className = `badge ${ticket.status.toLowerCase()}`;
          }
          const ticketRow = document.querySelector(
            `[data-ticket-row="${ticket.id}"]`,
          );
          if (
            ticketRow?.closest(`[data-live-queue="true"]`) &&
            !["Waiting", "Serving"].includes(ticket.status)
          )
            ticketRow.remove();
          const positionElement = document.querySelector(
            `[data-ticket-position="${ticket.id}"]`,
          );
          if (positionElement) {
            const position = ticket.position ?? "—";
            positionElement.textContent =
              positionElement.dataset.ticketPositionFormat === "number"
                ? `#${position}`
                : position;
          }
          const aheadElement = document.querySelector(
            `[data-ticket-ahead="${ticket.id}"]`,
          );
          if (aheadElement)
            aheadElement.textContent =
              ticket.position == null ? "—" : Math.max(0, ticket.position - 1);
        });
        const fresh = notifications.filter((item) => !seen.has(item.id));
        if (!fresh.length) return;
        fresh.forEach((item) => seen.add(item.id));
        localStorage.setItem(
          seenKey,
          JSON.stringify(Array.from(seen).slice(-100)),
        );
        fresh.reverse().forEach((item, index) => {
          setTimeout(() => toast(item.message), index * 2600);
        });
      } catch {
        /* Notifications can be retried on the next poll. */
      }
    };
    pollNotifications();
    window.queueNotificationTimer = setInterval(pollNotifications, 5000);
  }
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-toast],[data-action]");
    if (!target) return;
    if (target.dataset.toast) {
      event.preventDefault();
      toast(target.dataset.toast);
      return;
    }
    const index = Number(target.dataset.index),
      action = target.dataset.action;
    if (action === "logout") {
      event.preventDefault();
      try {
        await window.QueueSmartApi.logout();
      } catch {
        // Clear the local session even if it has already expired on the backend.
      }
      localStorage.removeItem(authStorageKey);
      location.href = "login.html";
      return;
    }
    if (action === "toggle-notifications") {
      const panel = document.querySelector("#notifications-panel");
      if (!panel) {
        toast("Open your dashboard to view notifications.");
        return;
      }
      panel.hidden = !panel.hidden;
      document
        .querySelectorAll('[data-action="toggle-notifications"]')
        .forEach((button) => {
          button.setAttribute("aria-expanded", String(!panel.hidden));
          if (button.dataset.openLabel)
            button.textContent = panel.hidden
              ? button.dataset.openLabel
              : button.dataset.closeLabel;
        });
      return;
    }

    if (action === "serve-next") {
      const serviceId = document.querySelector("#serve-service")?.value;
      if (!serviceId){
        toast("Choose a service first.");
        return;
      }
      target.disabled = true;

      try{
        const result = await window.QueueSmartApi.serveNext(serviceId);
        data.tickets = await window.QueueSmartApi.getTickets();

        renderLiveAdminView();

        toast(
          `Completed ${result.completed.number}` +
          (result.next
            ? `; now serving ${result.next.number}`
            : "; queue is now empty"
          )
        )
      } catch (error){
        toast(error.message);
        target.disabled = false;
      }
      return;
    }

    if (action === "remove") {
      try {
        await window.QueueSmartApi.leaveQueue(target.dataset.ticketId);
        data.tickets = await window.QueueSmartApi.getTickets();
        root.innerHTML = `<div class="toolbar"><label class="search-box">⌕ <input id="ticket-search" placeholder="Search tickets..."></label></div>${serveNextControls()}${table(true)}`;
        toast("Ticket cancelled.");
      } catch (error) {
        toast(error.message);
      }
    }
    if (action === "leave-queue") {
      try {
        await window.QueueSmartApi.leaveQueue(target.dataset.ticketId);
        sessionStorage.removeItem("queueTicket");
        location.href = "dashboard.html";
      } catch (error) {
        toast(error.message);
      }
    }
    if (action === "delete-service") {
      const service = data.services.find(
        (item) => item.id === target.dataset.serviceId,
      );
      if (!service || !window.confirm(`Delete ${service.name}?`)) return;
      try {
        await window.QueueSmartApi.deleteService(service.id);
        location.reload();
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    if (action === "new-service" || action === "edit-service")
      showServiceForm(action === "edit-service" ? index : null);
  });
  function showServiceForm(index = null) {
    const existing = index === null ? null : data.services[index];
    const slot = document.querySelector("#service-form-slot");
    if (!slot) return;
    slot.innerHTML = `<div class="form-card service-editor"><h2>${existing ? "Edit service" : "Create service"}</h2><form id="service-form" novalidate><label>Service name<input name="name" maxlength="100" required value="${existing?.name || ""}"></label><label>Description<textarea name="description" required rows="3">${existing?.description || ""}</textarea></label><label>Expected duration (minutes)<input name="duration" type="number" min="1" required value="${existing?.duration || ""}"></label><label>Priority level<select name="priority" required><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><div class="form-message" aria-live="polite"></div><button class="button button-primary">${existing ? "Save changes" : "Create service"}</button><button type="button" class="button button-secondary" data-action="cancel-form">Cancel</button></form></div>`;
    slot.scrollIntoView({ behavior: "smooth", block: "center" });
    if (existing)
      slot.querySelector('[name="priority"]').value =
        existing.priority || "low";
    slot
      .querySelector("#service-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        if (!f.reportValidity()) return;
        const duration = Number(f.elements.duration.value);
        const payload = {
          name: f.elements.name.value.trim(),
          description: f.elements.description.value.trim(),
          expectedDuration: duration,
          priorityLevel: f.elements.priority.value,
        };
        const message = f.querySelector(".form-message");
        const button =
          f.querySelector('button[type="submit"]') || f.querySelector("button");
        button.disabled = true;
        try {
          if (existing)
            await window.QueueSmartApi.updateService(existing.id, payload);
          else await window.QueueSmartApi.createService(payload);
          location.reload();
        } catch (error) {
          message.textContent = error.message;
          button.disabled = false;
        }
      });
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="cancel-form"]'))
      document.querySelector("#service-form-slot").innerHTML = "";
  });
  document.querySelector("#join-form")?.addEventListener("change", (e) => {
    if (e.target.name === "service") {
      const s = data.services.find((item) => item.id === e.target.value);
      const peopleAhead = data.tickets.filter(
        (ticket) =>
          ticket.service === s?.name &&
          ["Waiting", "Serving"].includes(ticket.status),
      ).length;
      document.querySelector("#wait-preview").textContent = s
        ? `Estimated wait: about ${peopleAhead * s.duration} minutes.`
        : "Select a service to see the estimated wait.";
    }
  });
  document
    .querySelector("#join-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      if (!f.reportValidity()) return;
      const message = f.querySelector(".form-message");
      try {
        const ticket = await window.QueueSmartApi.joinQueue(
          f.elements.service.value,
        );
        sessionStorage.setItem("queueTicket", JSON.stringify(ticket));
        location.href = "queue-status.html";
      } catch (error) {
        message.textContent = error.message;
      }
    });
  if (isPublic && (path === "login.html" || path === "register.html")) {
    const googleScript = document.createElement("script");
    googleScript.src = "js/config.js";
    googleScript.onload = () => {
      const loader = document.createElement("script");
      loader.src = "js/google-auth.js";
      document.body.append(loader);
    };
    document.body.append(googleScript);
  }
  document
    .querySelector("#auth-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      if (!f.reportValidity()) return;
      const message = f.querySelector(".form-message");
      const submitButton =
        f.querySelector('button[type="submit"]') || f.querySelector("button");
      submitButton.disabled = true;
      message.textContent = "";
      try {
        const credentials = {
          email: f.elements.email.value.trim(),
          password: f.elements.password.value,
        };
        const session =
          path === "register.html"
            ? await window.QueueSmartApi.register({
                name: f.elements.name.value.trim(),
                ...credentials,
              })
            : await window.QueueSmartApi.login(credentials);
        localStorage.setItem(authStorageKey, JSON.stringify(session));
        const requestedPage = new URLSearchParams(location.search).get(
          "returnTo",
        );
        const safePage =
          /^(dashboard|admin-dashboard|service-management|queue-management|history|join-queue|queue-status)\.html(?:\?role=admin)?$/.test(
            requestedPage || "",
          );
        const destination = safePage
          ? requestedPage
          : session.user.role === "admin"
            ? "admin-dashboard.html"
            : "dashboard.html";
        location.href = destination;
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submitButton.disabled = false;
      }
    });
  const applyQueueFilters = () => {
    const query =
      document.querySelector("#ticket-search")?.value.trim().toLowerCase() ||
      "";
    const service = document.querySelector("#service-filter")?.value || "";
    document.querySelectorAll("#page-content tbody tr").forEach((row) => {
      const rowService = row.cells[2]?.textContent.trim() || "";
      row.hidden =
        !row.textContent.toLowerCase().includes(query) ||
        (service && rowService !== service);
    });
  };
  document.addEventListener("input", (event) => {
    if (event.target.id === "ticket-search") applyQueueFilters();
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "service-filter") applyQueueFilters();
  });
})();
