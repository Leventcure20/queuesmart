(() => {
  const path = location.pathname.split("/").pop() || "index.html";
  const data = window.QueueSmartData;
  const isPublic = [
    "index.html",
    "login.html",
    "register.html",
    "join-queue.html",
    "queue-status.html",
  ].includes(path);
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
    : `<button class="mobile-nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false">☰</button><a class="mobile-brand" href="${admin ? "admin-dashboard.html" : "dashboard.html"}"><span class="brand-mark">Q</span> QueueSmart</a><div class="breadcrumbs">${admin ? "Administration" : "My workspace"} <span>/</span> <strong>${title}</strong></div><div class="top-actions"><span class="live-indicator"><i></i> Workspace preview</span><button class="icon-button" aria-label="Notifications" data-action="toggle-notifications" aria-expanded="false">♧<b></b></button><span class="avatar small-avatar">JL</span><a class="signout-button" href="login.html">Sign out</a></div>`;
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="${admin ? "admin-dashboard.html" : "dashboard.html"}"><span class="brand-mark">Q</span><span>Queue<span class="brand-light">Smart</span></span></a><button class="sidebar-toggle" type="button" aria-label="Collapse sidebar" aria-expanded="true"><span>‹</span></button><div class="side-label">${admin ? "ADMINISTRATION" : "YOUR QUEUES"}</div><nav>${nav.map(([href, label, icon]) => `<a class="nav-link ${path === href.split("?")[0] ? "active" : ""}" href="${href}"><span class="nav-icon">${icon}</span>${label}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="help-card"><span class="help-icon">?</span><strong>Need a hand?</strong><p>Get help with your workspace.</p><a href="#" data-toast="The help center is unavailable in this preview.">Visit help center →</a></div><a class="profile" href="login.html"><span class="avatar">JL</span><span><strong>Jordan Lee</strong><small>${admin ? "Administrator" : "QueueSmart user"}</small></span><span class="profile-more">···</span></a></div></aside><div class="sidebar-backdrop" data-close-sidebar></div><main class="main"><header class="topbar">${topbar}</header><section class="page-content"><div class="page-heading"><div><div class="eyebrow">QUEUESMART · ${admin ? "ADMIN" : "CUSTOMER"} PORTAL</div><h1>${title}</h1><p>${document.body.dataset.subtitle || "Manage your queues and services."}</p></div><div class="heading-actions">${path === "queue-management.html" ? '<button class="button button-primary" data-action="serve-next">Serve next →</button>' : ""}</div></div><div id="page-content"></div></section></main><div class="toast" role="status" aria-live="polite"></div>`;
  const root = document.querySelector("#page-content");
  const todayDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  const badge = (status) =>
    `<span class="badge ${status.toLowerCase()}"><i></i>${status}</span>`;
  const tickets = (history = false) =>
    data.tickets
      .map((ticket, index) => ({ ticket, index }))
      .filter(
        ({ ticket }) =>
          !history ||
          !["Waiting", "Serving", "Almost ready"].includes(ticket.status),
      )
      .map(
        ({ ticket: t, index: i }) =>
          `<tr><td><strong class="ticket-id">${t.number}</strong></td><td>${t.customer}</td><td>${t.service}</td><td class="muted">${history ? `${t.joinedDate || todayDate} · ` : ""}${t.joined}</td><td>${badge(t.status)}</td>${admin && !history ? `<td class="row-actions"><button class="mini-button" data-action="up" data-index="${i}" aria-label="Move up">↑</button><button class="mini-button" data-action="down" data-index="${i}" aria-label="Move down">↓</button><button class="mini-button" data-action="remove" data-index="${i}" aria-label="Remove ticket">×</button></td>` : ""}</tr>`,
      )
      .join("");
  const table = (actions = false) =>
    `<div class="panel"><div class="panel-heading"><div><h2>${actions ? "Selected service queue" : "Queue history"}</h2><p>${actions ? "Reorder or remove customers, or serve the next person." : "Completed visits and other past outcomes"}</p></div>${actions ? `<select id="service-filter" aria-label="Filter by service"><option value="">All services</option>${data.services.map((s) => `<option>${s.name}</option>`).join("")}</select>` : ""}</div><div class="table-wrap"><table class="${actions ? "" : "history-table"}"><thead><tr><th>TICKET</th><th>CUSTOMER</th><th>SERVICE</th><th>${actions ? "JOINED" : "DATE & TIME"}</th><th>STATUS</th>${actions ? "<th>ACTIONS</th>" : ""}</tr></thead><tbody>${tickets(!actions) || '<tr><td colspan="5" class="muted">No past queue visits yet.</td></tr>'}</tbody></table></div></div>`;
  const notificationList = (role) =>
    `<div class="panel notification-list" id="notifications-panel" hidden><div class="panel-heading"><div><h2>Recent notifications</h2><p>Queue and status updates</p></div></div>${data.notifications[role].map((item) => `<article class="notification-row"><span class="notification-type ${item.type}">${item.type === "status" ? "✓" : item.type === "wait" ? "◷" : "≋"}</span><span class="notification-copy"><strong>${item.title}</strong><small>${item.detail}</small></span><time>${item.time}</time></article>`).join("")}</div>`;
  const serviceList = (manage = false) =>
    `<div class="service-grid">${data.services.map((s, i) => `<article class="service-card"><div class="service-card-top"><span class="service-symbol symbol-${i % 3}">${["◈", "＄", "⌘"][i % 3]}</span>${badge(s.status || "Open")}</div><h3>${s.name}</h3><p>${s.description}</p><div class="service-metrics"><span><strong>${manage ? s.duration || 10 : s.wait} min</strong><small>${manage ? "Expected duration" : "Estimated wait"}</small></span><span><strong>${data.tickets.filter((t) => t.service === s.name && t.status === "Waiting").length + 2} people</strong><small>In this queue</small></span></div>${manage ? `<div class="card-actions"><button class="button button-secondary" data-action="edit-service" data-index="${i}">Edit</button><button class="button button-secondary" data-action="toggle-service" data-index="${i}">${s.status === "Open" ? "Close queue" : "Open queue"}</button></div>` : `<a class="button button-primary full-width" href="join-queue.html?service=${encodeURIComponent(s.id)}">Join queue →</a>`}</article>`).join("")}${manage ? "" : '<a class="add-service" href="join-queue.html"><span>＋</span><strong>Choose a service</strong><small>See all available queues</small></a>'}</div>`;
  const adminUsageStats = () =>
    `<section class="admin-usage-block" aria-labelledby="usage-heading"><h2 id="usage-heading">Today at a glance</h2><div class="admin-usage-stats" aria-label="Usage statistics"><article class="admin-stat-card"><span class="admin-stat-icon purple">↗</span><div><small>Served today</small><strong>${data.stats.servedToday}</strong></div></article><article class="admin-stat-card"><span class="admin-stat-icon blue">◷</span><div><small>Average wait time</small><strong>${data.stats.averageWait} <span>min</span></strong></div></article><article class="admin-stat-card"><span class="admin-stat-icon green">◇</span><div><small>Open services</small><strong>${data.services.filter((service) => service.status === "Open").length} <span>of ${data.services.length}</span></strong></div></article></div></section>`;
  let markup = "";
  if (path === "index.html")
    markup = `<section class="landing-hero"><div class="landing-copy"><div class="landing-kicker"><span></span> QUEUE MANAGEMENT, MADE SIMPLE</div><h2>Your place in line,<br><em>without waiting in one.</em></h2><p>Join a queue, see your estimated wait, and know when it’s nearly your turn—all from one simple place.</p><div class="landing-ctas"><a class="button button-primary" href="join-queue.html">Join a queue <span>→</span></a><a class="landing-secondary" href="register.html">Create an account</a></div><div class="landing-note"><span class="avatar-stack"><i>Q</i><i>✓</i></span><span>Simple updates, less time wondering.</span></div></div><div class="landing-preview"><div class="preview-glow"></div><div class="preview-card"><div class="preview-top"><span class="preview-label"><i></i> QUEUE PREVIEW</span><span class="preview-menu">···</span></div><div class="preview-service"><span class="service-symbol symbol-0">◈</span><span><strong>General Inquiry</strong><small>Service queue</small></span></div><div class="preview-ticket"><span>Your ticket</span><strong>A024</strong></div><div class="preview-position"><div><strong>4<small>th</small></strong><span>in line</span></div><div><strong>~12<small> min</small></strong><span>estimated wait</span></div></div><div class="preview-progress"><span></span></div><div class="preview-update"><span>✓</span><span><strong>You’re in the queue</strong><small>We’ll let you know when you’re almost up.</small></span></div><div class="preview-watermark">A sample of your queue status</div></div><div class="preview-orbit orbit-one"></div><div class="preview-orbit orbit-two"></div></div></section><section class="landing-features"><div class="landing-section-heading"><div class="eyebrow">A BETTER WAY TO WAIT</div><h2>Know what’s happening in line.</h2></div><div class="feature-grid"><article class="feature-card"><span class="feature-icon purple">◷</span><h3>See your wait</h3><p>Check your place and estimated wait before you plan your next step.</p></article><article class="feature-card"><span class="feature-icon blue">↗</span><h3>Keep your place</h3><p>Join a service queue and follow your ticket from your device.</p></article><article class="feature-card"><span class="feature-icon green">✓</span><h3>Know when you’re close</h3><p>Get a clear status update as your turn gets closer.</p></article></div></section><section class="landing-bottom"><div><h2>Ready to get started?</h2><p>Join a queue or create an account to keep track of your visits.</p></div><a class="button button-primary" href="join-queue.html">Get started <span>→</span></a></section><footer class="landing-footer"><a href="index.html">QueueSmart</a><span>Queue management made simpler.</span><a href="admin-dashboard.html">Administrator access</a></footer>`;
  else if (path === "login.html" || path === "register.html")
    markup = `<div class="form-card auth-form-card"><h2>${path === "login.html" ? "Welcome back" : "Create your account"}</h2><p>${path === "login.html" ? "Sign in to manage your queues." : "Register to join and track queues."}</p><form id="auth-form" novalidate>${path === "register.html" ? '<label>Full name<input name="name" autocomplete="name" required maxlength="100"></label>' : ""}<label>Email<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><div class="form-message" aria-live="polite"></div><button class="button button-primary full-width">${path === "login.html" ? "Sign in" : "Create account"} →</button></form><div class="auth-divider"><span>or continue with</span></div><button type="button" id="google-signin-fallback" class="google-fallback"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.92c-.58 2.96-2.26 5.48-4.74 7.18l7.3 5.66c4.27-3.94 6.73-9.74 6.73-17.31z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.79l-7.3-5.66c-2.02 1.35-4.6 2.15-8.6 2.15-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 43.62 14.62 48 24 48z"/></svg><span>Continue with Google</span></button><div id="google-signin-button"></div><div class="form-switch">${path === "login.html" ? 'New to QueueSmart? <a href="register.html">Create an account</a>' : 'Already registered? <a href="login.html">Sign in</a>'}</div></div>`;
  else if (path === "join-queue.html")
    markup = `<div class="form-card"><p>Choose an active service and save your place.</p><form id="join-form" novalidate><label>Your name<input name="name" autocomplete="name" maxlength="100" required placeholder="e.g. Jordan Lee"></label><label>Email address<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>Service<select name="service" required><option value="">Select a service</option>${data.services
      .filter((s) => s.status === "Open")
      .map(
        (s) =>
          `<option value="${s.id}">${s.name} · about ${s.wait} min wait</option>`,
      )
      .join(
        "",
      )}</select></label><div class="wait-preview" id="wait-preview">Select a service to see the estimated wait.</div><div class="form-message" aria-live="polite"></div><button class="button button-primary full-width">Join queue →</button></form></div>`;
  else if (path === "queue-status.html") {
    const current = JSON.parse(
      sessionStorage.getItem("queueTicket") || "null",
    ) ||
      data.tickets.find((t) => t.status === "Waiting") || {
        number: "A024",
        service: "General Inquiry",
        status: "Waiting",
        wait: "12 min",
      };
    const liveQueue = data.tickets.filter((t) => ["Waiting", "Almost ready"].includes(t.status));
    const queueIndex = liveQueue.findIndex((t) => t.number === current.number);
    const positionNumber = queueIndex + 1;
    const suffix = positionNumber % 100 >= 11 && positionNumber % 100 <= 13 ? "th" : ["st", "nd", "rd"][positionNumber % 10 - 1] || "th";
    const position = current.status === "Serving" ? "Now serving" : ["Served", "Completed"].includes(current.status) ? "Served" : queueIndex < 0 ? "—" : `${positionNumber}${suffix}`;
    markup = `<div class="status-card"><span class="status-check">✓</span><div class="eyebrow">QUEUE UPDATE</div><h2>Ticket <span class="ticket-id" id="status-ticket">${current.number}</span></h2><p id="status-copy">You’re in line for ${current.service}. We’ll notify you when it’s your turn.</p><div class="wait-highlight"><strong id="status-wait">~${current.wait}</strong><span>Estimated wait time</span></div><div class="queue-position"><span>Your ticket status</span><strong id="status-state">${current.status}</strong></div><div class="queue-position"><span>Your position in line</span><strong id="status-position">${position}</strong></div><div class="queue-position"><span>People ahead of you</span><strong id="status-ahead">${Math.max(0, queueIndex)}</strong></div><button class="button button-secondary full-width" data-action="advance-status">Simulate queue update</button><button class="button button-danger full-width" data-action="leave-queue">Leave queue</button></div>`;
  } else if (path === "service-management.html")
    markup = `<div class="section-intro"><div><h2>Active services</h2><p>Create, update, and open or close queues.</p></div><button class="button button-primary" data-action="new-service">＋ Add service</button></div><div id="service-form-slot"></div>${serviceList(true)}`;
  else if (path === "queue-management.html")
    markup = `<div class="toolbar"><div class="tabs"><span class="tab active">Live queue</span></div><label class="search-box">⌕ <input id="ticket-search" placeholder="Search tickets..." aria-label="Search tickets"></label></div>${table(true)}`;
  else if (path === "history.html") markup = table(false);
  else if (path === "admin-dashboard.html")
    markup = `${adminUsageStats()}<div class="section-intro"><div><h2>Service queues</h2><p>Current queue lengths and availability.</p></div><a class="button button-secondary" href="service-management.html">Manage services →</a></div>${serviceList(true)}<div class="notification-card"><strong>Notifications</strong><span>Recent service and queue updates.</span><button class="button button-secondary" data-action="toggle-notifications" data-open-label="View updates" data-close-label="Hide updates" aria-expanded="false">View updates</button></div>${notificationList("admins")}`;
  else
    markup = `<div class="user-welcome"><div><h2>Welcome back, Jordan</h2><p>Here’s your queue activity today.</p></div><a class="button button-primary" href="join-queue.html">＋ Join a queue</a></div><div class="notification-card"><strong>Notifications <span class="notification-dot"></span></strong><span>Recent queue and status updates.</span><button class="button button-secondary" data-action="toggle-notifications" data-open-label="View notifications" data-close-label="Hide notifications" aria-expanded="false">View notifications</button></div>${notificationList("users")}<div class="section-intro"><div><h2>Available services</h2><p>Join a service queue and track your wait.</p></div></div>${serviceList(false)}<div class="panel recent-history"><div class="panel-heading"><div><h2>Your recent queues</h2><p>Past and current visits</p></div><a href="history.html" class="text-link">View history →</a></div><div class="table-wrap"><table><thead><tr><th>TICKET</th><th>SERVICE</th><th>JOINED</th><th>STATUS</th></tr></thead><tbody>${data.tickets
      .slice(0, 3)
      .map(
        (t) =>
          `<tr><td class="ticket-id">${t.number}</td><td>${t.service}</td><td>${t.joined}</td><td>${badge(t.status)}</td></tr>`,
      )
      .join("")}</tbody></table></div></div>`;
  root.innerHTML = markup;
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
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-toast],[data-action]");
    if (!target) return;
    if (target.dataset.toast) {
      event.preventDefault();
      toast(target.dataset.toast);
      return;
    }
    const index = Number(target.dataset.index),
      action = target.dataset.action;
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
    if (action === "toggle-service") {
      const s = data.services[index];
      s.status = s.status === "Open" ? "Closed" : "Open";
      data.save?.();
      if (path === "admin-dashboard.html") {
        document
          .querySelector(".service-grid")
          ?.replaceWith(
            document.createRange().createContextualFragment(serviceList(true)),
          );
      } else {
        root.innerHTML = `${document.querySelector(".section-intro")?.outerHTML || ""}${serviceList(true)}`;
      }
      toast(`${s.name} queue ${s.status.toLowerCase()}.`);
    }
    if (action === "remove") {
      data.tickets.splice(index, 1);
      data.save?.();
      root.innerHTML = `${table(true)}`;
      toast("Ticket removed from the demo queue.");
    }
    if (action === "up" || action === "down") {
      const next = index + (action === "up" ? -1 : 1);
      if (next >= 0 && next < data.tickets.length)
        [data.tickets[index], data.tickets[next]] = [
          data.tickets[next],
          data.tickets[index],
        ];
      data.save?.();
      root.innerHTML = `<div class="toolbar"><label class="search-box">⌕ <input id="ticket-search" placeholder="Search tickets..."></label></div>${table(true)}`;
    }
    if (action === "serve-next") {
      const next = data.tickets.find((t) => t.status === "Waiting");
      if (next) {
        next.status = "Serving";
        data.save?.();
        toast(`${next.number} is now being served.`);
        root.innerHTML = `<div class="toolbar"><label class="search-box">⌕ <input id="ticket-search" placeholder="Search tickets..."></label></div>${table(true)}`;
      } else toast("No customers are waiting.");
    }
    if (action === "advance-status") {
      const states = ["Waiting", "Almost ready", "Served"];
      const node = document.querySelector("#status-state");
      const currentStatus = node?.textContent || "Waiting";

      // A served ticket should not cycle back to Waiting.
      if (currentStatus === "Served") {
        toast("This ticket has already been served.");
        return;
      }

      const currentIndex = states.indexOf(currentStatus);
      const nextStatus = states[currentIndex + 1] || "Served";

      // Update the ticket in the application's mocked data.
      const ticketNumber = document
        .querySelector("#status-ticket")
        ?.textContent.trim();

      const ticket = data.tickets.find(
        (item) => item.number === ticketNumber,
      );

      if (ticket) {
        ticket.status = nextStatus;

        if (nextStatus === "Served") {
          ticket.wait = "0 min";
        }

        data.save?.();
      }

      // Keep the user's current ticket in session storage in sync too.
      const storedTicket = JSON.parse(
        sessionStorage.getItem("queueTicket") || "null",
      );

      if (storedTicket && storedTicket.number === ticketNumber) {
        storedTicket.status = nextStatus;

        if (nextStatus === "Served") {
          storedTicket.wait = "0 min";
        }

        sessionStorage.setItem(
          "queueTicket",
          JSON.stringify(storedTicket),
        );
      }

      // Update what the user sees on the page.
      if (node) node.textContent = nextStatus;

      if (nextStatus === "Served") {
        const positionNode = document.querySelector("#status-position");
        const waitNode = document.querySelector("#status-wait");
        const aheadNode = document.querySelector("#status-ahead");

        if (positionNode) positionNode.textContent = "Served";
        if (waitNode) waitNode.textContent = "0 min";
        if (aheadNode) aheadNode.textContent = "0";
      }

      const copy = document.querySelector("#status-copy");

      if (copy) {
        copy.textContent =
          nextStatus === "Served"
            ? "You have been served. Thanks for using QueueSmart!"
            : "You’re almost up. Please get ready.";
      }

      toast(`Queue status updated: ${nextStatus}.`);
    }
    if (action === "leave-queue") {
      const ticket = JSON.parse(
        sessionStorage.getItem("queueTicket") || "null",
      );
      if (ticket) {
        data.tickets = data.tickets.filter((t) => t.number !== ticket.number);
        data.save?.();
        sessionStorage.removeItem("queueTicket");
      }
      toast("You left the queue.");
      location.href = "dashboard.html";
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
    slot.querySelector("#service-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      if (!f.reportValidity()) return;
      const duration = Number(f.elements.duration.value);
      const item = {
        id: existing?.id || `S-${String(Date.now()).slice(-4)}`,
        name: f.elements.name.value.trim(),
        description: f.elements.description.value.trim(),
        duration,
        wait: existing?.wait || duration * 2,
        priority: f.elements.priority.value,
        status: existing?.status || "Open",
      };
      if (existing) data.services[index] = item;
      else data.services.push(item);
      data.save?.();
      location.reload();
    });
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="cancel-form"]'))
      document.querySelector("#service-form-slot").innerHTML = "";
  });
  document.querySelector("#join-form")?.addEventListener("change", (e) => {
    if (e.target.name === "service") {
      const s = data.services.find((item) => item.id === e.target.value);
      document.querySelector("#wait-preview").textContent = s
        ? `Estimated wait: about ${s.wait} minutes.`
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
          f.elements.name.value.trim(),
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
  document.querySelector("#auth-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.reportValidity()) return;
    window.location.href = "dashboard.html";
    
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
