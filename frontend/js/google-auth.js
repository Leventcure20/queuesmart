(() => {
  const mount = document.querySelector("#google-signin-button");
  if (!mount) return;
  const fallback = document.querySelector("#google-signin-fallback");
  const config = window.QueueSmartConfig || {};
  const clientId = config.googleClientId?.trim();
  if (!clientId) {
    if (fallback) fallback.disabled = true;
    return;
  }

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.onload = () => {
    if (!window.google?.accounts?.id) {
      console.error("Google Identity Services could not load.");
      if (fallback) fallback.disabled = true;
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        const message = document.querySelector('#auth-form .form-message');
        if (message) message.textContent = '';
        try {
          const response = await fetch(
            config.googleAuthEndpoint || "/api/auth/google",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ credential }),
            },
          );
          const session = await response.json();
          if (!response.ok) throw new Error(session.error || "Google sign-in failed.");
          localStorage.setItem('QueueSmartAuth', JSON.stringify(session));
          const requestedPage = new URLSearchParams(location.search).get('returnTo');
          const safePage = /^(dashboard|admin-dashboard|service-management|queue-management|history|join-queue|queue-status)\.html(?:\?role=admin)?$/.test(requestedPage || '');
          location.href = safePage
            ? requestedPage
            : session.user.role === 'admin' ? 'admin-dashboard.html' : 'dashboard.html';
        } catch (error) {
          console.error("Google sign-in failed:", error);
          if (message) message.textContent = error.message;
        }
      },
    });
    window.google.accounts.id.renderButton(mount, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: location.pathname.endsWith("/register.html")
        ? "signup_with"
        : "signin_with",
      width: Math.min(350, mount.clientWidth || 350),
    });
    fallback?.remove();
  };
  script.onerror = () => {
    console.error("Google Identity Services could not load.");
    if (fallback) fallback.disabled = true;
  };
  document.head.append(script);
})();
