(() => {
  const loginForm = document.querySelector('#auth-form');
  if (loginForm && !document.querySelector('[data-forgot-password-link]')) {
    const link = document.createElement('p');
    link.className = 'form-switch';
    link.innerHTML = '<a data-forgot-password-link href="forgot-password.html">Forgot password?</a>';
    loginForm.insertAdjacentElement('afterend', link);
  }

  const forgotForm = document.querySelector('#forgot-password-form');
  forgotForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector('.form-message');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.textContent = '';
    try {
      const result = await window.QueueSmartApi.requestPasswordReset(form.elements.email.value.trim());
      message.textContent = `${result.message} For this local demo, check the backend terminal for the link.`;
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  const resetForm = document.querySelector('#reset-password-form');
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
