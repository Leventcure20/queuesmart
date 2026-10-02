(() => {
  const mount = document.querySelector('#google-signin-button');
  if (!mount) return;
  const fallback = document.querySelector('#google-signin-fallback');
  const config = window.QueueSmartConfig || {};
  const clientId = config.googleClientId?.trim();
  if (!clientId) {
    if (fallback) fallback.disabled = true;
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = () => {
    if (!window.google?.accounts?.id) {
      console.error('Google Identity Services could not load.');
      if (fallback) fallback.disabled = true;
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        try {
          const response = await fetch(config.googleAuthEndpoint || '/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ credential })
          });
          if (!response.ok) throw new Error('Google sign-in request failed.');
          location.href = 'dashboard.html';
        } catch (error) {
          console.error('Google sign-in failed:', error);
        }
      }
    });
    window.google.accounts.id.renderButton(mount, {
      type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular',
      text: 'continue_with', width: Math.min(350, mount.clientWidth || 350)
    });
    fallback?.remove();
  };
  script.onerror = () => { console.error('Google Identity Services could not load.'); if (fallback) fallback.disabled = true; };
  document.head.append(script);
})();
