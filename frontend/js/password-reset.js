(() => {
  const loginForm = document.querySelector('#auth-form');
  if (loginForm && !document.querySelector('[data-forgot-password-link]')) {
    const link = document.createElement('p');
    link.className = 'form-switch';
    link.innerHTML = '<a data-forgot-password-link href="forgot-password.html">Forgot password?</a>';
    loginForm.insertAdjacentElement('afterend', link);
  }

  const forgotForm = document.querySelector('#forgot-password-form');
  if (forgotForm && new URLSearchParams(location.search).has('expired')) {
    forgotForm.querySelector('.form-message').textContent = 'That reset link has expired. Please request a new one.';
  }
  forgotForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.form-message');
    const demoLinkMessage = document.querySelector('#demo-reset-link');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.textContent = '';
    demoLinkMessage.hidden = true;
    demoLinkMessage.replaceChildren();
    try {
      const result = await window.QueueSmartApi.requestPasswordReset(form.elements.email.value.trim());
      message.textContent = result.resetLink ? '' : result.message;
      if (result.resetLink) {
        demoLinkMessage.append(document.createTextNode(`${result.message} `));
        const link = document.createElement('a');
        link.className = 'demo-reset-link';
        link.href = result.resetLink;
        link.textContent = 'Click here to reset your password';
        link.style.cssText = 'display: block; margin-top: 10px; color: #2563eb; font-weight: 700; text-align: center; text-decoration: underline;';
        demoLinkMessage.append(link);
        demoLinkMessage.hidden = false;
      }
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  const resetForm = document.querySelector('#reset-password-form');
  const resetParams = new URLSearchParams(location.hash.slice(1));
  let expiryTimer;
  if (resetForm && resetParams.has('token')) {
    const expiresAt = Date.parse(resetParams.get('expiresAt') || '');
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      window.location.replace('forgot-password.html?expired=1');
      return;
    }
    expiryTimer = window.setTimeout(() => {
      window.location.replace('forgot-password.html?expired=1');
    }, expiresAt - Date.now());
    let idleTimer;
    const returnToSignInWhenIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        window.location.replace('login.html');
      }, 60_000);
    };
    ['pointerdown', 'keydown', 'input', 'touchstart'].forEach((eventName) => {
      resetForm.addEventListener(eventName, returnToSignInWhenIdle);
    });
    returnToSignInWhenIdle();
  }

  resetForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.form-message');
    const button = form.querySelector('button[type="submit"]');
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    const password = form.elements.password.value;
    if (!token) {
      message.textContent = 'This reset link is missing or invalid. Request a new one.';
      return;
    }
    if (password !== form.elements.confirmPassword.value) {
      message.textContent = 'The passwords do not match.';
      return;
    }

    button.disabled = true;
    message.textContent = '';
    try {
      const result = await window.QueueSmartApi.resetPassword({ token, password });
      window.clearTimeout(expiryTimer);
      history.replaceState(null, '', location.pathname);
      localStorage.removeItem('QueueSmartAuth');
      message.textContent = result.message;
      form.reset();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
